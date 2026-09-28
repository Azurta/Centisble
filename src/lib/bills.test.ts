import { describe, expect, it } from "vitest";
import { billsForMonth, billTotals, dueDate, suggestBills, type Bill } from "./bills";
import { classifyAll } from "./classify";
import { goalProgress } from "./goals";
import type { Account, Transaction } from "./types";

const accounts: Account[] = [
  { id: "chk", name: "Checking", type: "checking", source: "plaid", balance: 900 },
  { id: "cc", name: "Discover it", type: "credit", source: "plaid", balance: 400, minPayment: 35, nextDue: "2026-10-12" },
  { id: "sav", name: "Savings", type: "savings", source: "plaid", balance: 600 },
];
const tx = (id: string, accountId: string, date: string, description: string, amount: number): Transaction => ({ id, accountId, date, description, amount });
const txs = classifyAll(
  [
    tx("1", "chk", "2026-08-03", "VERIZON WIRELESS", 65),
    tx("2", "chk", "2026-09-03", "VERIZON WIRELESS", 65),
    tx("3", "chk", "2026-08-01", "AVALON APARTMENTS RENT", 1100),
    tx("4", "chk", "2026-09-01", "AVALON APARTMENTS RENT", 1100),
    tx("5", "cc", "2026-09-10", "PAYMENT - THANK YOU", -200),
  ],
  accounts,
);

describe("bills", () => {
  it("clamps due days to the month", () => {
    expect(dueDate({ dueDay: 31 }, "2026-02")).toBe("2026-02-28");
  });

  it("marks bills paid, due soon or overdue", () => {
    const bills: Bill[] = [
      { id: "phone", name: "Verizon", amount: 65, dueDay: 3 },
      { id: "card", name: "Discover", amount: 35, dueDay: 12, accountId: "cc" },
      { id: "gym", name: "Planet Fitness", amount: 25, dueDay: 20 },
      { id: "ins", name: "Geico", amount: 118, dueDay: 28, remindDays: 5 },
    ];
    const occ = billsForMonth(bills, txs, "2026-09", new Date("2026-09-24T12:00:00Z"));
    const by = Object.fromEntries(occ.map((o) => [o.bill.id, o.status]));
    expect(by).toEqual({ phone: "paid", card: "paid", gym: "overdue", ins: "due-soon" });
    expect(billTotals(occ)).toEqual({ total: 243, paid: 265, left: 143 });
  });

  it("suggests bills from repeating charges and bank due dates", () => {
    const s = suggestBills(txs, accounts, [{ id: "x", name: "Verizon Wireless", amount: 65, dueDay: 3, match: "verizon wireless" }], "2026-09");
    expect(s.map((b) => [b.name, b.dueDay, b.amount])).toEqual([
      ["Discover it payment", 12, 35],
      ["Avalon Apartments Rent", 1, 1100],
    ]);
  });
});

it("tidies bank-style names", async () => {
  const { tidyName } = await import("./bills");
  expect(tidyName("HULU 877-8244858")).toBe("Hulu");
  expect(tidyName("NETFLIX.COM")).toBe("Netflix.com");
  expect(tidyName("Verizon Wireless")).toBe("Verizon Wireless");
});

describe("goals", () => {
  it("tracks progress and the monthly amount needed", () => {
    const p = goalProgress({ id: "g", name: "Emergency fund", target: 1000, saved: 250, deadline: "2026-12" }, accounts, new Date("2026-09-15"));
    expect(p).toMatchObject({ saved: 250, left: 750, monthsLeft: 4, perMonth: 187.5, done: false });
    const linked = goalProgress({ id: "g2", name: "Trip", target: 500, saved: 0, accountId: "sav" }, accounts);
    expect(linked).toMatchObject({ saved: 600, done: true, share: 1 });
  });
});
