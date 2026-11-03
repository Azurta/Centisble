import { findRecurring } from "./analytics";
import { billsForMonth, tidyName, type Bill } from "./bills";
import { merchantKey } from "./classify";
import { goalProgress, type Goal } from "./goals";
import type { Account, ClassifiedTransaction } from "./types";

/**
 * "Safe to spend until payday": cash you have now, minus bills and card minimums due before your next
 * paycheck, minus what your savings goals need for those days.
 */
export interface SafeToSpend {
  safe: number;
  perDay: number;
  /** YYYY-MM-DD of the next paycheck (or the end of the month when no paycheck is found). */
  until: string;
  days: number;
  paydayFound: boolean;
  cash: number;
  /** `expected`: not a bill you added, but it comes out of checking every month. */
  dueBeforePayday: { name: string; amount: number; date: string; expected?: boolean }[];
  goals: number;
}

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => ymd(new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** The next paycheck: the biggest repeating deposit, projected forward by its usual gap. */
export function nextPayday(txs: ClassifiedTransaction[], today: string): string | undefined {
  const groups = new Map<string, ClassifiedTransaction[]>();
  for (const t of txs) {
    if (t.kind !== "income" || -t.amount < 100) continue;
    const k = merchantKey(t);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  let best: ClassifiedTransaction[] | undefined;
  for (const g of groups.values())
    if (g.length >= 2 && (!best || total(g) > total(best))) best = g;
  if (!best) return undefined;
  const dates = [...new Set(best.map((t) => t.date))].sort();
  // Paid on the same day(s) of the month (like the 1st and 15th): use the calendar.
  const monthDays = [...new Set(dates.map((d) => Number(d.slice(8, 10))))].sort((a, b) => a - b);
  if (monthDays.length <= 2 && new Set(dates.map((d) => d.slice(0, 7))).size >= 2) {
    for (let i = 1; i <= 62; i++) {
      const d = addDays(today, i);
      const dim = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate();
      const dd = Number(d.slice(8, 10));
      if (monthDays.some((m) => Math.min(m, dim) === dd)) return d;
    }
  }
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d)).filter((g) => g >= 5);
  if (!gaps.length) return undefined;
  const gap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  let next = dates[dates.length - 1];
  while (next <= today) next = addDays(next, gap);
  return next;
}

const total = (g: ClassifiedTransaction[]) => g.reduce((s, t) => s - t.amount, 0);

export function safeToSpend(input: {
  accounts: Account[];
  txs: ClassifiedTransaction[];
  bills: Bill[];
  goals: Goal[];
  today?: Date;
}): SafeToSpend {
  const now = input.today ?? new Date();
  const today = ymd(now);
  const payday = nextPayday(input.txs, today);
  const endOfMonth = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));
  const until = payday ?? endOfMonth;
  const days = Math.max(1, daysBetween(today, until));

  // Spendable money: checking and cash, not savings (that's for goals) and not imported sheets.
  const cash = input.accounts
    .filter((a) => !a.hidden && a.source !== "import" && (a.type === "checking" || a.type === "cash") && a.balance != null)
    .reduce((s, a) => s + (a.balance ?? 0), 0);

  // Bills still unpaid that fall due today through payday (this month and next).
  const months = [today.slice(0, 7), until.slice(0, 7)].filter((m, i, a) => a.indexOf(m) === i);
  const due: SafeToSpend["dueBeforePayday"] = [];
  for (const m of months)
    for (const o of billsForMonth(input.bills, input.txs, m, now))
      if (o.status !== "paid" && o.date >= today && o.date <= until) due.push({ name: o.bill.name, amount: o.bill.amount, date: o.date });
  // Card and loan minimums the bank reports, when no bill already covers that account.
  for (const a of input.accounts)
    if ((a.type === "credit" || a.type === "loan") && !a.hidden && a.nextDue && a.minPayment && a.nextDue >= today && a.nextDue <= until && !input.bills.some((b) => b.accountId === a.id))
      due.push({ name: `${a.name} minimum`, amount: a.minPayment, date: a.nextDue });
  // Charges that come out of checking every month (loans, insurance) but aren't set up as bills yet.
  const spendIds = new Set(input.accounts.filter((a) => a.type === "checking" || a.type === "cash").map((a) => a.id));
  const fromChecking = input.txs.filter((t) => spendIds.has(t.accountId));
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const r of findRecurring(fromChecking, today.slice(0, 7), { includeFixed: true })) {
    const label = norm(r.label);
    if (input.bills.some((b) => { const n = norm(b.match || b.name); return n && (label.includes(n) || n.includes(label)); })) continue;
    const day = Number(r.lastDate.slice(8, 10));
    for (const m of months) {
      if (r.lastDate.slice(0, 7) >= m) continue; // already charged that month
      const dim = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
      const date = `${m}-${String(Math.min(day, dim)).padStart(2, "0")}`;
      if (date >= today && date <= until) { due.push({ name: tidyName(r.label), amount: Math.round(r.monthly * 100) / 100, date, expected: true }); break; }
    }
  }
  due.sort((x, y) => x.date.localeCompare(y.date));

  // Savings goals with a deadline: set aside their monthly amount for these days.
  const goals = input.goals.reduce((s, g) => {
    const p = goalProgress(g, input.accounts, now);
    return s + (!p.done && p.perMonth ? (p.perMonth * days) / 30 : 0);
  }, 0);

  const safe = Math.round((cash - due.reduce((s, d) => s + d.amount, 0) - goals) * 100) / 100;
  return { safe, perDay: Math.round((safe / days) * 100) / 100, until, days, paydayFound: Boolean(payday), cash, dueBeforePayday: due, goals: Math.round(goals * 100) / 100 };
}
