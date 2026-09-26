import { describe, expect, it } from "vitest";
import { summarize } from "./analytics";
import { monthFromName, parseBudgetWorkbook, type Cell, type SheetGrid } from "./budgetSheet";
import { classifyAll } from "./classify";

// Mirrors the layout of a hand-made monthly budget sheet: summary table, income block, expense table.
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const rows: Cell[][] = [];
rows[2] = ["Category", "Actual", "Goal"];
rows[3] = ["Income", 3000, 6000];
rows[4] = ["Expenses", 4000, 5500];
rows[5] = ["Food & Groceries", 413, 300];
rows[6] = ["Eating Out", 377, 220];
rows[7] = ["Savings", 200, 1500];
rows[8] = ["Net Total", -1111];
rows[17] = ["Income", "Income", "Expenses"];
rows[18] = ["Goal", 5000, "Goal"];
rows[19] = ["Actual", 3000, "Actual"];
rows[20] = ["Paycheck", 1500, "Date", "Item", "Quantity", "Price", "Category", "Payment", "Notes", "Total"];
rows[21] = ["Paycheck", 1500, d("2026-08-04"), "Panda", 1, 13.29, "Eating Out", "Capital One", null, 13.29];
rows[22] = [null, null, d("2026-08-05"), "Meat from aldi", 1, 43.15, "Food & Groceries", "Capital One", null, 43.15];
rows[23] = [null, null, null, "Gas", 1, 51.27, "Car", "Discover", null, 51.27];
rows[24] = [null, null, d("2026-08-14"), "Capital one pay", 1, 578.97, "Debt", "Cash", null, 578.97];
rows[25] = [null, null, d("2026-08-17"), "Discover payment", 1, 150, "Debt", "Cash", null, 150];
rows[26] = [null, null, d("2026-08-25"), "Savings", 1, 200, "Savings", "Cash", null, 200];
rows[27] = [null, null, d("2026-08-28"), "Gustavus Tuition", 1, 516.14, "Debt", "Cash", null, 516.14];
rows[28] = [null, null, d("2026-08-30"), "Piano", 1, 200, "Shopping", "Savings", null, 200];
rows[39] = ["Savings", "Savings"];
rows[40] = ["Amount in", 1100.86];
rows[51] = ["Debt", "Debt"];
rows[53] = ["Discover", 818.18];
const main: SheetGrid = { name: "Visuals", rows: Array.from(rows, (r) => r ?? []) };

const tab: SheetGrid = {
  name: "Alc",
  rows: [["ALC", "ALC"], ["Budget: $400"], ["Item", "Quantity", " Individual Price", "Link/Location", "Notes", "Total"], ["Moscato", 1, 8.98, null, null, 8.98], ["Shooters", 2, 3.19, "Schofield", null, null], [null, null, null, null, "Activity Total", 15.36]],
};

describe("budget sheet import", () => {
  it("reads income, expenses, card payments and savings", () => {
    const r = parseBudgetWorkbook("August_Monthly_Budget.xlsx", [main], new Date("2026-09-26"));
    expect(r.month).toBe("2026-08");
    expect(r.income).toBe(3000);
    expect(r.cardPayments).toBeCloseTo(728.97);
    expect(r.saved).toBe(200);
    const gas = r.transactions.find((t) => t.description === "Gas")!;
    expect(gas.date).toBe("2026-08-05"); // undated rows take the previous row's date
    expect(gas.paidWith).toBe("Discover");
    expect(r.goals).toEqual({ groceries: 300, going_out: 220 });
  });

  it("does not count card payments as spending", () => {
    const r = parseBudgetWorkbook("August_Monthly_Budget.xlsx", [main], new Date("2026-09-26"));
    const s = summarize(classifyAll(r.transactions, []), "2026-08");
    expect(s.spending).toBeCloseTo(13.29 + 43.15 + 51.27 + 516.14 + 200);
    expect(s.byCategory.debt).toBeCloseTo(516.14); // tuition is real debt; card payments aren't
    expect(s.saved).toBe(200);
    expect(s.transfersExcluded).toBeCloseTo(728.97);
  });

  it("uses the tab title as the category for per-category tabs", () => {
    const r = parseBudgetWorkbook("May_expenses.xlsx", [tab], new Date("2026-09-26"));
    expect(r.month).toBe("2026-05");
    const c = classifyAll(r.transactions, []);
    expect(c.map((t) => [t.description, t.amount, t.category])).toEqual([
      ["Moscato", 8.98, "alcohol"],
      ["Shooters", 6.38, "alcohol"],
    ]);
  });

  it("infers the month from the file name", () => {
    expect(monthFromName("September_Monthly_Budgeting_Template.xlsx")).toBe(9);
    expect(monthFromName("June Budgeting Sheet.xlsx")).toBe(6);
    expect(monthFromName("budget.xlsx")).toBeUndefined();
  });
});
