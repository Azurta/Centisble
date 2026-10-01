import { describe, expect, it } from "vitest";
import { summarize } from "./analytics";
import { CASH_WALLET_ID, walletBalance } from "./cash";
import { classifyAll } from "./classify";
import type { Account, Transaction } from "./types";

const wallet: Account = { id: CASH_WALLET_ID, name: "Cash", type: "cash", source: "manual", balance: 100, balanceAsOf: "2026-05-01T12:00:00.000Z" };
const chk: Account = { id: "chk", name: "Checking", type: "checking", source: "plaid", balance: 900 };
const at = (iso: string) => Date.parse(iso);
const tx = (id: string, accountId: string, date: string, description: string, amount: number, importedCategory?: string): Transaction => ({
  id, accountId, date, description, amount, importedCategory,
});

describe("cash wallet", () => {
  const txs = [
    tx(`cash-${at("2026-05-03T10:00:00Z")}-a`, CASH_WALLET_ID, "2026-05-03", "Tips", -60, "Income"),
    tx(`cash-${at("2026-05-04T10:00:00Z")}-b`, CASH_WALLET_ID, "2026-05-04", "Lunch", 15, "Going out"),
    tx("b1", "chk", "2026-05-05", "ATM WITHDRAWAL 1234 MAIN ST", 40),
    tx("b2", "chk", "2026-05-06", "ATM FEE", 3),
    tx("b3", "chk", "2026-05-07", "CASH DEPOSIT BRANCH", -50),
    tx(`cash-${at("2026-04-30T10:00:00Z")}-c`, CASH_WALLET_ID, "2026-04-30", "Before the count", 999, "Shopping"),
  ];
  const c = classifyAll(txs, [wallet, chk]);
  const by = (id: string) => c.find((t) => t.id.startsWith(id) || t.id === id)!;

  it("counts cash income as income and cash purchases as spending", () => {
    const s = summarize(c, "2026-05");
    expect(s.income).toBe(60);
    expect(by("b1").kind).toBe("transfer"); // the ATM cash isn't spending until it's spent
    expect(by("b3").kind).toBe("transfer"); // depositing your own cash isn't income
    expect(by("b2").kind).toBe("interest"); // the ATM fee is a real cost
    expect(s.byCategory.going_out).toBe(15);
  });

  it("keeps a running balance from the last count", () => {
    // 100 counted + 60 tips − 15 lunch + 40 ATM − 50 deposited; the entry made before the count doesn't change it.
    expect(walletBalance(wallet, c)).toBe(135);
  });

  it("leaves ATM withdrawals alone when no wallet is tracked", () => {
    const plain = classifyAll([tx("b1", "chk", "2026-05-05", "ATM WITHDRAWAL 1234 MAIN ST", 40)], [chk]);
    expect(plain[0].cashMove).toBeUndefined();
  });
});
