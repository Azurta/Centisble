import { describe, expect, it } from "vitest";
import { paymentFor, paymentSite, payoffPlan } from "./payoff";

describe("payoff", () => {
  it("computes months and interest for a fixed payment", () => {
    const p = payoffPlan(1000, 24, 100, new Date("2026-09-26"))!;
    expect(p.months).toBe(12); // 11 full payments + a partial one
    expect(p.totalInterest).toBeGreaterThan(100);
    expect(p.totalInterest).toBeLessThan(140);
    expect(p.paidOffBy).toBe("2027-08");
  });

  it("flags a payment that doesn't cover interest", () => {
    expect(payoffPlan(10000, 24, 150)).toBeUndefined();
  });

  it("finds the payment for a target date", () => {
    const pay = paymentFor(1000, 24, 12);
    expect(pay).toBeCloseTo(94.56, 1);
    expect(payoffPlan(1000, 24, pay)!.months).toBe(12);
    expect(paymentFor(1200, 0, 12)).toBe(100);
  });

  it("links known lenders and your own saved link", () => {
    expect(paymentSite("Capital One Quicksilver")).toBe("https://www.capitalone.com");
    expect(paymentSite("Student Loans", "mohela.studentaid.gov")).toBe("https://mohela.studentaid.gov");
    expect(paymentSite("Private Loan")).toBeUndefined();
  });
});
