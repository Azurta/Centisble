import { describe, expect, it } from "vitest";
import { classifyAll } from "./classify";
import { nextPayday, safeToSpend } from "./safeToSpend";
import { findSubscriptions, recentIncreases } from "./subscriptions";
import type { Account, Transaction } from "./types";

const chk: Account = { id: "chk", name: "Checking", type: "checking", source: "plaid", balance: 1200 };
const sav: Account = { id: "sav", name: "Savings", type: "savings", source: "plaid", balance: 3000 };
const visa: Account = { id: "cc", name: "Visa", type: "credit", source: "plaid", balance: 600, minPayment: 35, nextDue: "2026-11-10" };
const tx = (id: string, accountId: string, date: string, description: string, amount: number): Transaction => ({ id, accountId, date, description, amount });

describe("subscriptions", () => {
  const txs = classifyAll(
    [
      tx("n1", "chk", "2026-08-05", "NETFLIX.COM", 15.49),
      tx("n2", "chk", "2026-09-05", "NETFLIX.COM", 15.49),
      tx("n3", "chk", "2026-10-05", "NETFLIX.COM", 17.99),
      tx("s1", "chk", "2026-09-12", "SPOTIFY USA", 11.99),
      tx("s2", "chk", "2026-10-12", "SPOTIFY USA", 11.99),
      tx("e1", "chk", "2026-08-20", "CITY ELECTRIC UTILITY", 80),
      tx("e2", "chk", "2026-09-20", "CITY ELECTRIC UTILITY", 120),
      tx("e3", "chk", "2026-10-20", "CITY ELECTRIC UTILITY", 95),
      tx("g1", "chk", "2026-09-02", "TRADER JOE'S", 60),
      tx("g2", "chk", "2026-10-02", "TRADER JOE'S", 60),
    ],
    [chk],
  );
  const subs = findSubscriptions(txs, "2026-10");

  it("finds steady monthly charges and skips habit spending and bills that vary", () => {
    expect(subs.map((s) => s.label).sort()).toEqual(["NETFLIX.COM", "SPOTIFY USA"]);
  });

  it("spots a price increase and links to cancel", () => {
    const n = subs.find((s) => s.label === "NETFLIX.COM")!;
    expect(n.increase).toEqual({ from: 15.49, to: 17.99, date: "2026-10-05" });
    expect(n.cancelUrl).toContain("netflix.com");
    expect(subs[0].label).toBe("NETFLIX.COM"); // increases first
    expect(subs.find((s) => s.label === "SPOTIFY USA")!.increase).toBeUndefined();
    expect(recentIncreases(subs, "2026-10-01")).toHaveLength(1);
    expect(recentIncreases(subs, "2026-10-06")).toHaveLength(0);
  });
});

describe("safe to spend", () => {
  const txs = classifyAll(
    [
      tx("p1", "chk", "2026-10-03", "ACME CORP PAYROLL", -1450),
      tx("p2", "chk", "2026-10-17", "ACME CORP PAYROLL", -1450),
      tx("p3", "chk", "2026-10-31", "ACME CORP PAYROLL", -1450),
      tx("v1", "chk", "2026-10-04", "VERIZON WIRELESS", 65),
    ],
    [chk, sav, visa],
  );

  it("projects the next paycheck from the usual gap", () => {
    expect(nextPayday(txs, "2026-11-03")).toBe("2026-11-14");
  });

  it("knows twice-a-month paydays", () => {
    const semi = classifyAll(
      ["2026-09-01", "2026-09-15", "2026-10-01", "2026-10-15", "2026-11-01"].map((d, i) => tx(`q${i}`, "chk", d, "ACME CORP PAYROLL", -1450)),
      [chk],
    );
    expect(nextPayday(semi, "2026-11-03")).toBe("2026-11-15");
    expect(nextPayday(semi, "2026-11-15")).toBe("2026-12-01");
  });

  it("subtracts bills and card minimums due before payday and goal savings", () => {
    const r = safeToSpend({
      accounts: [chk, sav, visa],
      txs,
      bills: [
        { id: "b1", name: "Verizon", amount: 65, dueDay: 4 },
        { id: "b2", name: "Rent", amount: 1100, dueDay: 1 },
        { id: "b3", name: "Gym", amount: 25, dueDay: 20 },
      ],
      goals: [],
      today: new Date("2026-11-03T15:00:00Z"),
    });
    // $1,200 checking − Verizon $65 (Nov 4) − Visa minimum $35 (Nov 10). Rent (Nov 1) was before today; gym is after payday.
    expect(r.until).toBe("2026-11-14");
    expect(r.paydayFound).toBe(true);
    expect(r.dueBeforePayday.map((d) => d.name)).toEqual(["Verizon", "Visa minimum"]);
    expect(r.safe).toBe(1100);
    expect(r.days).toBe(11);
    expect(r.perDay).toBe(100);
  });
});
