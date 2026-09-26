import { describe, expect, it } from "vitest";
import { accountTypeFor, mapSimplefin } from "./simplefin";

describe("SimpleFIN mapping", () => {
  it("maps accounts and flips amounts to money-out-positive", () => {
    const { accounts, transactions } = mapSimplefin({
      accounts: [
        {
          org: { name: "Capital One" }, id: "a1", name: "Quicksilver Card", currency: "USD", balance: "-612.40", "balance-date": 1790000000,
          transactions: [
            { id: "t1", posted: 1789900000, amount: "-13.29", description: "PANDA EXPRESS", payee: "Panda Express" },
            { id: "t2", posted: 1789950000, amount: "578.97", description: "PAYMENT - THANK YOU" },
            { id: "t3", posted: 0, amount: "-9.64", description: "MATCHA BAR", pending: true },
          ],
        },
        { org: { name: "Intercity State Bank" }, id: "a2", name: "Checking", currency: "USD", balance: "1240.55", "balance-date": 1790000000 },
      ],
    });
    expect(accounts[0]).toMatchObject({ id: "sf-a1", name: "Capital One Quicksilver Card", type: "credit", balance: 612.4 });
    expect(accounts[1]).toMatchObject({ type: "checking", balance: 1240.55 });
    expect(transactions.map((t) => t.amount)).toEqual([13.29, -578.97, 9.64]);
    expect(transactions[0].merchant).toBe("Panda Express");
    expect(transactions[2].pending).toBe(true);
  });

  it("guesses account types from names", () => {
    expect(accountTypeFor({ name: "Honda Auto Loan", balance: "-31149.57" })).toBe("loan");
    expect(accountTypeFor({ name: "High Yield Savings", balance: "245.17" })).toBe("savings");
    expect(accountTypeFor({ name: "Discover it Card", balance: "-1018.69" })).toBe("credit");
    expect(accountTypeFor({ name: "Everyday Checking", balance: "12.00" })).toBe("checking");
  });
});
