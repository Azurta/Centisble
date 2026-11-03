import { describe, expect, it } from "vitest";
import { canAfford, usualDailySpend } from "./afford";
import { classifyAll } from "./classify";
import type { SafeToSpend } from "./safeToSpend";
import { stoppedSubscriptions } from "./subscriptions";
import type { Account, Transaction } from "./types";

const chk: Account = { id: "chk", name: "Checking", type: "checking", source: "plaid", balance: 1000 };
const tx = (id: string, date: string, description: string, amount: number): Transaction => ({ id, accountId: "chk", date, description, amount });
const safe: SafeToSpend = { safe: 412, perDay: 45.78, until: "2026-11-15", days: 9, paydayFound: true, cash: 900, dueBeforePayday: [], goals: 0 };

describe("can I afford it", () => {
  it("says yes when what's left still covers usual daily spending", () => {
    expect(canAfford(100, safe, 30).verdict).toBe("yes");
  });
  it("says tight when it fits but leaves less than usual per day, and offers goals", () => {
    const r = canAfford(180, safe, 31, [{ name: "Concerts", saved: 240 }, { name: "Trip", saved: 50 }]);
    expect(r.verdict).toBe("tight");
    expect(r.left).toBe(232);
    expect(r.leftPerDay).toBe(25.78);
    expect(r.fromGoals.map((g) => g.name)).toEqual(["Concerts"]);
  });
  it("says no when it's more than what's safe", () => {
    expect(canAfford(500, safe, 30).verdict).toBe("no");
  });
  it("works out usual daily spending without rent and bills", () => {
    const txs = classifyAll([tx("a", "2026-10-20", "TRADER JOE'S", 90), tx("b", "2026-10-25", "CHIPOTLE", 30), tx("c", "2026-11-01", "AVALON APARTMENTS RENT", 1100)], [chk]);
    expect(usualDailySpend(txs, new Date("2026-11-03T12:00:00Z"))).toBe(4);
  });
});

describe("stopped subscriptions", () => {
  it("counts a steady charge that stopped 45+ days ago at its yearly cost", () => {
    const txs = classifyAll(
      [tx("h1", "2026-06-09", "HULU 877-8244858", 17.99), tx("h2", "2026-07-09", "HULU 877-8244858", 17.99), tx("h3", "2026-08-09", "HULU 877-8244858", 17.99),
       tx("s1", "2026-09-04", "SPOTIFY USA", 11.99), tx("s2", "2026-10-04", "SPOTIFY USA", 11.99)],
      [chk],
    );
    const r = stoppedSubscriptions(txs, new Date("2026-11-03T12:00:00Z"));
    expect(r.map((s) => s.label)).toEqual(["HULU 877-8244858"]);
    expect(r[0].yearly).toBe(215.88);
  });
});
