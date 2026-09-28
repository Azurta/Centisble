import { describe, expect, it } from "vitest";
import { summarize, summarizeMonths, ytdMonths } from "./analytics";
import { classifyAll } from "./classify";
import type { Transaction } from "./types";

const tx = (id: string, date: string, description: string, amount: number): Transaction => ({ id, accountId: "chk", date, description, amount });
const all = classifyAll(
  [
    tx("1", "2026-01-02", "PAYROLL DIRECT DEP", -2000),
    tx("2", "2026-01-05", "KROGER", 100),
    tx("3", "2026-02-02", "PAYROLL DIRECT DEP", -2000),
    tx("4", "2026-02-09", "KROGER", 150),
    tx("5", "2026-02-10", "CHIPOTLE", 20),
    tx("6", "2025-12-30", "KROGER", 999),
  ],
  [{ id: "chk", name: "Checking", type: "checking", source: "plaid" }],
);

describe("year to date", () => {
  it("lists months from January", () => {
    expect(ytdMonths("2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("adds months together and ignores last year", () => {
    const y = summarizeMonths(all, ytdMonths("2026-02"));
    expect(y.income).toBe(4000);
    expect(y.spending).toBe(270);
    expect(y.byCategory.groceries).toBe(250);
    expect(y.savingsRate).toBeCloseTo((4000 - 270) / 4000);
    expect(summarize(all, "2026-02").spending).toBe(170);
  });
});
