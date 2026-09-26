import { describe, expect, it } from "vitest";
import { classifyAll } from "./classify";
import { applyEdits, netWorth } from "./networth";
import type { Account } from "./types";

const accounts: Account[] = [
  { id: "chk", name: "Checking", type: "checking", source: "plaid", balance: 1200 },
  { id: "sav", name: "Savings", type: "savings", source: "plaid", balance: 3000 },
  { id: "cc", name: "Card", type: "credit", source: "plaid", balance: 600, creditLimit: 2000, apr: 24 },
  { id: "car", name: "Car loan", type: "loan", source: "manual", balance: 12000, apr: 6 },
  { id: "new", name: "No balance yet", type: "checking", source: "plaid" },
];

describe("net worth", () => {
  it("adds up what you own and owe, and estimates interest", () => {
    const txs = classifyAll([{ id: "i", accountId: "cc", date: "2026-09-28", description: "PURCHASE INTEREST CHARGE", amount: 11.5 }], accounts);
    const nw = netWorth(accounts, txs, "2026-09");
    expect(nw.totalAssets).toBe(4200);
    expect(nw.totalDebt).toBe(12600);
    expect(nw.netWorth).toBe(-8400);
    expect(nw.debts.map((d) => d.account.id)).toEqual(["cc", "car"]); // highest rate first
    expect(nw.debts[0].monthlyInterest).toBeCloseTo(12);
    expect(nw.debts[0].utilization).toBeCloseTo(0.3);
    expect(nw.debts[0].chargedThisMonth).toBe(11.5);
    expect(nw.monthlyInterest).toBeCloseTo(12 + 60);
    expect(nw.missingBalance.map((a) => a.id)).toEqual(["new"]);
  });

  it("applies your edits and hides accounts", () => {
    const edited = applyEdits(accounts, { cc: { apr: 29.99 }, sav: { hidden: true } });
    const nw = netWorth(edited, [], "2026-09");
    expect(nw.totalAssets).toBe(1200);
    expect(nw.debts[0].apr).toBe(29.99);
  });
});
