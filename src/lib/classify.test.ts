import { describe, expect, it } from "vitest";
import { summarize } from "./analytics";
import { classifyAll } from "./classify";
import { demoData } from "./demo";
import type { Account, Transaction } from "./types";

const accounts: Account[] = [
  { id: "chk", name: "Checking", type: "checking", source: "import" },
  { id: "cc", name: "Card", type: "credit", source: "import" },
  { id: "sav", name: "Savings", type: "savings", source: "import" },
];
const tx = (id: string, accountId: string, date: string, description: string, amount: number): Transaction => ({
  id, accountId, date, description, amount,
});

describe("classifyAll", () => {
  it("does not double count a credit card payment", () => {
    const txs = [
      tx("1", "chk", "2026-05-01", "PAYROLL DIRECT DEP", -2000),
      tx("2", "cc", "2026-05-03", "TRADER JOE'S #552", 80),
      tx("3", "cc", "2026-05-04", "THE TIPSY TAVERN", 40),
      tx("4", "chk", "2026-05-20", "CHASE CREDIT CRD EPAY", 120),
      tx("5", "cc", "2026-05-21", "PAYMENT - THANK YOU", -120),
    ];
    const c = classifyAll(txs, accounts);
    expect(c.find((t) => t.id === "4")!.kind).toBe("transfer");
    expect(c.find((t) => t.id === "5")!.kind).toBe("transfer");
    const s = summarize(c, "2026-05");
    expect(s.spending).toBe(120);
    expect(s.income).toBe(2000);
    expect(s.naiveOutflow).toBe(240); // what a sum-every-row sheet would show
    expect(s.byCategory.groceries).toBe(80);
    expect(s.byCategory.alcohol).toBe(40);
  });

  it("pairs same-amount payments even without keywords", () => {
    const txs = [tx("a", "chk", "2026-05-10", "WEB PMT 88213", 300), tx("b", "cc", "2026-05-12", "CREDIT 88213", -300)];
    const c = classifyAll(txs, accounts);
    expect(c.map((t) => t.kind)).toEqual(["transfer", "transfer"]);
  });

  it("counts interest as real spending under Debt", () => {
    const c = classifyAll([tx("i", "cc", "2026-05-28", "PURCHASE INTEREST CHARGE", 24.19)], accounts);
    expect(c[0].kind).toBe("interest");
    expect(c[0].category).toBe("debt");
    expect(summarize(c, "2026-05").interestPaid).toBeCloseTo(24.19);
  });

  it("counts a card payment as spending when the card isn't linked", () => {
    const onlyChecking = [accounts[0]];
    const c = classifyAll([tx("p", "chk", "2026-05-20", "CAPITAL ONE MOBILE PYMT", 500)], onlyChecking);
    expect(c[0].kind).toBe("expense");
  });

  it("treats checking -> savings as saving, not spending", () => {
    const txs = [tx("s1", "chk", "2026-05-16", "Online Transfer to Savings", 100), tx("s2", "sav", "2026-05-16", "Online Transfer from Checking", -100)];
    const c = classifyAll(txs, accounts);
    const s = summarize(c, "2026-05");
    expect(s.spending).toBe(0);
    expect(s.saved).toBe(100);
  });

  it("treats card refunds as negative spending in their category", () => {
    const txs = [tx("r1", "cc", "2026-05-02", "NIKE.COM", 120), tx("r2", "cc", "2026-05-09", "NIKE.COM REFUND", -120)];
    const c = classifyAll(txs, accounts);
    expect(c[1].kind).toBe("refund");
    expect(summarize(c, "2026-05").byCategory.shopping).toBe(0);
  });

  it("respects user overrides and merchant rules", () => {
    const txs = [tx("x", "cc", "2026-05-02", "RANDOM SHOP 123", 10), tx("y", "cc", "2026-05-03", "RANDOM SHOP 456", 20)];
    const c = classifyAll(txs, accounts, { category: { x: "going_out" }, kind: {}, merchantRules: { "random shop": "alcohol" } });
    expect(c[0].category).toBe("going_out");
    expect(c[1].category).toBe("alcohol");
  });

  it("uses spreadsheet categories", () => {
    const t = { ...tx("g", "cc", "2026-05-02", "Corner store", 15), importedCategory: "Buying food" };
    expect(classifyAll([t], accounts)[0].category).toBe("groceries");
  });

  it("demo data: card spending is counted once", () => {
    const { accounts: a, transactions } = demoData(new Date("2026-09-26"));
    const c = classifyAll(transactions, a);
    const payments = c.filter((t) => /EPAY|THANK YOU/.test(t.description));
    expect(payments.length).toBeGreaterThan(0);
    expect(payments.every((t) => t.kind === "transfer")).toBe(true);
    const s = summarize(c, "2026-08");
    expect(s.naiveOutflow).toBeGreaterThan(s.spending + s.transfersExcluded - 1);
    expect(s.interestPaid).toBeGreaterThan(0);
  });
});
