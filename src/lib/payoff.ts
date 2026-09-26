/** Payoff math for one debt with a fixed monthly payment (interest compounds monthly). */

export interface PayoffPlan {
  months: number;
  totalInterest: number;
  /** YYYY-MM of the last payment. */
  paidOffBy: string;
}

/** Undefined when the payment doesn't even cover the monthly interest (the balance would never shrink). */
export function payoffPlan(balance: number, aprPct: number, payment: number, from = new Date()): PayoffPlan | undefined {
  if (balance <= 0) return { months: 0, totalInterest: 0, paidOffBy: from.toISOString().slice(0, 7) };
  const r = aprPct / 100 / 12;
  if (payment <= balance * r) return undefined;
  let months: number;
  if (r === 0) months = Math.ceil(balance / payment);
  else months = Math.ceil(-Math.log(1 - (balance * r) / payment) / Math.log(1 + r));
  // Interest = everything paid minus the principal (the last payment is partial).
  let bal = balance;
  let interest = 0;
  for (let i = 0; i < months && bal > 0; i++) {
    const int = bal * r;
    interest += int;
    bal = bal + int - Math.min(payment, bal + int);
  }
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months - 1, 1));
  return { months, totalInterest: interest, paidOffBy: d.toISOString().slice(0, 7) };
}

/** Monthly payment that clears the balance in `months` months. */
export function paymentFor(balance: number, aprPct: number, months: number): number {
  const r = aprPct / 100 / 12;
  if (r === 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

/** Well-known lenders' sites, used when you haven't saved a payment link yourself. */
const LENDER_SITES: [RegExp, string][] = [
  [/capital\s*one/i, "https://www.capitalone.com"],
  [/discover/i, "https://www.discover.com"],
  [/chase/i, "https://www.chase.com"],
  [/citi/i, "https://www.citi.com"],
  [/amex|american\s*express/i, "https://www.americanexpress.com"],
  [/wells\s*fargo/i, "https://www.wellsfargo.com"],
  [/bank\s*of\s*america/i, "https://www.bankofamerica.com"],
  [/nelnet/i, "https://nelnet.studentaid.gov"],
  [/mohela/i, "https://mohela.studentaid.gov"],
  [/aidvantage/i, "https://aidvantage.studentaid.gov"],
  [/honda/i, "https://www.hondafinancialservices.com"],
  [/toyota/i, "https://www.toyotafinancial.com"],
];

export function paymentSite(name: string, saved?: string): string | undefined {
  if (saved) return /^https?:\/\//i.test(saved) ? saved : `https://${saved}`;
  return LENDER_SITES.find(([re]) => re.test(name))?.[1];
}
