import { categoryInfo, spendingCategories } from "./categories";
import { merchantKey } from "./classify";
import type { Budgets, CategoryId, ClassifiedTransaction } from "./types";

export const monthOf = (date: string) => date.slice(0, 7);

export function monthsIn(txs: ClassifiedTransaction[]): string[] {
  return [...new Set(txs.map((t) => monthOf(t.date)))].sort().reverse();
}

export interface MonthSummary {
  month: string;
  income: number;
  /** Real spending: purchases + interest/fees − refunds. Card payments & transfers excluded. */
  spending: number;
  /** Money moved into savings/investments (net of withdrawals). */
  saved: number;
  interestPaid: number;
  /** What a "sum every outflow" spreadsheet would report — card payments counted twice. */
  naiveOutflow: number;
  /** Amount excluded from spending because it was a card payment / internal transfer. */
  transfersExcluded: number;
  leftOver: number;
  savingsRate: number; // (income − spending) / income
  byCategory: Partial<Record<CategoryId, number>>;
  needs: number;
  wants: number;
  txCount: number;
}

export function summarize(all: ClassifiedTransaction[], month: string): MonthSummary {
  const txs = all.filter((t) => monthOf(t.date) === month);
  let income = 0, spending = 0, saved = 0, interestPaid = 0, naiveOutflow = 0, transfersExcluded = 0;
  const byCategory: Partial<Record<CategoryId, number>> = {};
  for (const t of txs) {
    if (t.amount > 0) naiveOutflow += t.amount;
    switch (t.kind) {
      case "income":
        income += -t.amount;
        break;
      case "savings":
        saved += t.amount;
        break;
      case "transfer":
        if (t.amount > 0) transfersExcluded += t.amount;
        break;
      case "interest":
        interestPaid += t.amount;
      // falls through — interest is real spending
      case "expense":
      case "refund":
        spending += t.amount;
        byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
        break;
    }
  }
  let needs = 0, wants = 0;
  for (const [cat, amt] of Object.entries(byCategory) as [CategoryId, number][]) {
    if (categoryInfo(cat).bucket === "needs") needs += amt;
    else wants += amt;
  }
  return {
    month, income, spending, saved, interestPaid, naiveOutflow, transfersExcluded,
    leftOver: income - spending - saved,
    savingsRate: income > 0 ? (income - spending) / income : 0,
    byCategory, needs, wants, txCount: txs.length,
  };
}

export function trend(all: ClassifiedTransaction[], count = 6): MonthSummary[] {
  return monthsIn(all).slice(0, count).reverse().map((m) => summarize(all, m));
}

const roundUp5 = (n: number) => Math.ceil(n / 5) * 5;

/**
 * Starting budgets from your own history, nudged toward the 50/30/20 rule:
 * needs keep their average, wants are scaled down so they fit in 30% of income.
 */
export function suggestBudgets(history: MonthSummary[]): Budgets {
  const full = history.filter((m) => m.income > 0);
  if (!full.length) return {};
  const avgIncome = full.reduce((s, m) => s + m.income, 0) / full.length;
  const avg: Partial<Record<CategoryId, number>> = {};
  for (const c of spendingCategories())
    avg[c.id] = full.reduce((s, m) => s + Math.max(0, m.byCategory[c.id] ?? 0), 0) / full.length;
  const wantsTotal = spendingCategories().filter((c) => c.bucket === "wants").reduce((s, c) => s + (avg[c.id] ?? 0), 0);
  const wantsScale = wantsTotal > avgIncome * 0.3 ? (avgIncome * 0.3) / wantsTotal : 1;
  const out: Budgets = {};
  for (const c of spendingCategories()) {
    const a = avg[c.id] ?? 0;
    if (a < 1) continue;
    out[c.id] = roundUp5(c.bucket === "wants" ? a * wantsScale : a);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Where you could save                                                */
/* ------------------------------------------------------------------ */

export interface Recurring {
  key: string;
  label: string;
  monthly: number;
  category: CategoryId;
  months: number;
  /** Date of the most recent charge (YYYY-MM-DD). */
  lastDate: string;
  /** A sample description, for matching future charges. */
  description: string;
}

/**
 * Charges from the same merchant, at a similar amount, in at least 2 of the last 3 months.
 * `includeFixed` also returns rent and loan payments (wanted for bills, not for "subscriptions to cut").
 */
export function findRecurring(all: ClassifiedTransaction[], month: string, opts: { includeFixed?: boolean } = {}): Recurring[] {
  const recent = new Set(monthsIn(all).filter((m) => m <= month).slice(0, 3));
  const groups = new Map<string, ClassifiedTransaction[]>();
  for (const t of all) {
    if (t.kind !== "expense" || !recent.has(monthOf(t.date))) continue;
    // Rent/loans are expected; groceries, gas and eating out repeat by habit, not by contract.
    if ((opts.includeFixed ? [] : ["rent", "debt"]).concat(["groceries", "going_out", "alcohol"]).includes(t.category)) continue;
    if (/gas|fuel|shell|chevron|exxon|mobil|wawa|sheetz|speedway|valero|arco/i.test(t.description)) continue;
    const k = merchantKey(t);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  const out: Recurring[] = [];
  for (const [key, txs] of groups) {
    const months = new Set(txs.map((t) => monthOf(t.date)));
    if (months.size < 2 || txs.length > months.size + 1) continue; // frequent shopping ≠ subscription
    const amounts = txs.map((t) => t.amount);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (amounts.some((a) => Math.abs(a - avg) > Math.max(1, avg * 0.05))) continue;
    const latest = txs.reduce((a, b) => (b.date > a.date ? b : a));
    out.push({
      key,
      label: latest.merchant || latest.description,
      monthly: avg,
      category: latest.category,
      months: months.size,
      lastDate: latest.date,
      description: latest.description,
    });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

export interface Tip {
  id: string;
  title: string;
  detail: string;
  /** Estimated monthly savings if you follow the tip. */
  monthly: number;
  category?: CategoryId;
  severity: "critical" | "serious" | "warning" | "good";
  lesson?: string; // id of a related lesson
}

/** Future value of saving `monthly` every month for `years` at `rate` annual return. */
export function futureValue(monthly: number, years = 10, rate = 0.07): number {
  const r = rate / 12, n = years * 12;
  return monthly * ((Math.pow(1 + r, n) - 1) / r);
}

export function savingTips(all: ClassifiedTransaction[], s: MonthSummary, budgets: Budgets): Tip[] {
  const tips: Tip[] = [];
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

  if (s.interestPaid > 0)
    tips.push({
      id: "interest", severity: "critical", monthly: s.interestPaid, category: "debt", lesson: "credit-cards",
      title: `You paid ${fmt(s.interestPaid)} in interest & fees`,
      detail: "Pay the full statement balance every month (set autopay to “statement balance”) and card points stay free. Interest wipes out any rewards you earn.",
    });

  if (s.income > 0 && s.spending > s.income)
    tips.push({
      id: "overspend", severity: "critical", monthly: s.spending - s.income, lesson: "budget-basics",
      title: `You spent ${fmt(s.spending - s.income)} more than you earned`,
      detail: "This gap usually ends up on a credit card and starts costing interest. Start with the biggest “wants” category below.",
    });

  for (const c of spendingCategories()) {
    const spent = s.byCategory[c.id] ?? 0;
    const limit = budgets[c.id];
    if (limit && spent > limit)
      tips.push({
        id: `over-${c.id}`, severity: c.bucket === "wants" ? "serious" : "warning", monthly: spent - limit, category: c.id,
        title: `${c.label} is ${fmt(spent - limit)} over its limit`,
        detail: `You spent ${fmt(spent)} against a ${fmt(limit)} limit.`,
      });
  }

  if (s.income > 0 && s.wants > s.income * 0.3) {
    const extra = s.wants - s.income * 0.3;
    const biggest = spendingCategories().filter((c) => c.bucket === "wants")
      .map((c) => ({ c, v: s.byCategory[c.id] ?? 0 }))
      .sort((a, b) => b.v - a.v)[0];
    tips.push({
      id: "wants", severity: "serious", monthly: extra, category: biggest?.c.id, lesson: "50-30-20",
      title: `“Wants” are ${Math.round((s.wants / s.income) * 100)}% of your income (goal: 30%)`,
      detail: `Trimming ${fmt(extra)}/mo gets you to 30%. Your biggest want is ${biggest?.c.label ?? "—"} at ${fmt(biggest?.v ?? 0)}.`,
    });
  }

  const monthTx = all.filter((t) => monthOf(t.date) === s.month && t.kind === "expense");
  const small = monthTx.filter((t) => t.category === "going_out" && t.amount < 25);
  if (small.length >= 8) {
    const total = small.reduce((a, t) => a + t.amount, 0);
    tips.push({
      id: "small-going-out", severity: "warning", monthly: total / 2, category: "going_out", lesson: "latte-factor",
      title: `${small.length} small food & drink purchases added up to ${fmt(total)}`,
      detail: "Cutting these in half — e.g. coffee at home on weekdays — is one of the easiest wins.",
    });
  }

  const alcohol = s.byCategory.alcohol ?? 0;
  if (s.income > 0 && alcohol > s.income * 0.05)
    tips.push({
      id: "alcohol", severity: "warning", monthly: alcohol / 2, category: "alcohol",
      title: `Alcohol was ${fmt(alcohol)} (${Math.round((alcohol / s.income) * 100)}% of income)`,
      detail: "Pre-gaming at home or setting a cash limit for nights out typically halves this.",
    });

  const recurring = findRecurring(all, s.month);
  const subs = recurring.filter((r) => r.category === "subscriptions" || r.monthly < 50);
  if (subs.length >= 2) {
    const total = subs.reduce((a, r) => a + r.monthly, 0);
    tips.push({
      id: "subs", severity: "warning", monthly: Math.min(...subs.map((r) => r.monthly)), category: "subscriptions", lesson: "subscriptions",
      title: `${subs.length} recurring charges cost ${fmt(total)}/mo`,
      detail: `${subs.slice(0, 5).map((r) => `${r.label} (${fmt(r.monthly)})`).join(", ")}. Cancelling even the cheapest one you don't use saves the amount shown.`,
    });
  }

  if (s.income > 0 && s.savingsRate < 0.2 && s.spending <= s.income) {
    const gap = s.income * 0.2 - (s.income - s.spending);
    tips.push({
      id: "savings-rate", severity: "warning", monthly: gap, lesson: "pay-yourself-first",
      title: `You kept ${Math.round(s.savingsRate * 100)}% of your income (goal: 20%)`,
      detail: `Set up an automatic ${fmt(s.income * 0.2)} transfer to savings on payday so you never see it in checking.`,
    });
  }

  if (!tips.length)
    tips.push({
      id: "great", severity: "good", monthly: 0, lesson: "investing-101",
      title: "No leaks found this month",
      detail: "You're under your limits, saving 20%+, and paying no interest. Next step: invest what you save.",
    });

  return tips.sort((a, b) => b.monthly - a.monthly);
}

/* ------------------------------------------------------------------ */
/* Money Score — rewards good habits, penalizes bad ones              */
/* ------------------------------------------------------------------ */

export interface ScoreItem { label: string; points: number; }
export interface MoneyScore {
  score: number;
  grade: string;
  penalties: ScoreItem[];
  bonuses: ScoreItem[];
  /** Amount you "owe" your savings account for going over budget. */
  penaltyJar: number;
}

export function moneyScore(all: ClassifiedTransaction[], s: MonthSummary, budgets: Budgets, lessonsDone: number): MoneyScore {
  const penalties: ScoreItem[] = [];
  const bonuses: ScoreItem[] = [];
  const monthTx = all.filter((t) => monthOf(t.date) === s.month);

  if (s.income > 0 && s.spending > s.income) penalties.push({ label: "Spent more than you earned", points: -25 });
  if (s.income > 0 && s.savingsRate < 0.2)
    penalties.push({ label: `Kept ${Math.max(0, Math.round(s.savingsRate * 100))}% of income (goal 20%)`, points: -Math.min(20, Math.round((0.2 - Math.max(0, s.savingsRate)) * 100)) });
  const interest = monthTx.filter((t) => t.kind === "interest" && /interest|finance/i.test(t.description));
  if (interest.length) penalties.push({ label: "Paid credit card / loan interest", points: s.interestPaid > 50 ? -15 : -10 });
  const fees = monthTx.filter((t) => t.kind === "interest" && !/interest|finance/i.test(t.description));
  if (fees.length) penalties.push({ label: `${fees.length} late/overdraft fee${fees.length > 1 ? "s" : ""}`, points: -Math.min(20, fees.length * 10) });

  let penaltyJar = 0;
  let overCount = 0;
  for (const c of spendingCategories()) {
    const limit = budgets[c.id];
    const spent = s.byCategory[c.id] ?? 0;
    if (limit && spent > limit) {
      overCount++;
      penaltyJar += spent - limit;
    }
  }
  if (overCount) penalties.push({ label: `Over the limit in ${overCount} categor${overCount > 1 ? "ies" : "y"}`, points: -Math.min(20, overCount * 5) });
  if (s.income > 0 && s.wants > s.income * 0.3) penalties.push({ label: "Wants above 30% of income", points: -10 });

  if (s.income > 0 && s.savingsRate >= 0.2) bonuses.push({ label: "Saved 20%+ of income", points: 5 });
  if (s.saved > 0) bonuses.push({ label: "Moved money into savings", points: 3 });
  if (lessonsDone) bonuses.push({ label: `Finished ${lessonsDone} lesson${lessonsDone > 1 ? "s" : ""}`, points: Math.min(10, lessonsDone * 2) });

  const raw = 100 + penalties.reduce((a, p) => a + p.points, 0) + bonuses.reduce((a, b) => a + b.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return { score, grade, penalties, bonuses, penaltyJar };
}
