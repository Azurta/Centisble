import { spendingCategories } from "./categories";
import type { MonthSummary } from "./analytics";
import type { Budgets, CategoryId } from "./types";

export type LimitState = "none" | "ok" | "warn" | "over";

export interface LimitStatus {
  id: CategoryId;
  spent: number;
  limit?: number;
  /** Share of the limit used, 0–1+. */
  used: number;
  state: LimitState;
  left: number;
  /** What you can still spend per day for the rest of the month and stay under the limit. */
  perDay: number;
}

/** Days left in `month` counting today, or the whole month if it's in the future / 0 if it's over. */
export function daysLeft(month: string, today = new Date()): number {
  const [y, m] = month.split("-").map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cur = today.toISOString().slice(0, 7);
  if (month < cur) return 0;
  if (month > cur) return dim;
  return dim - today.getUTCDate() + 1;
}

export function limitStatuses(s: MonthSummary, budgets: Budgets, alertAt: number, today = new Date()): LimitStatus[] {
  const days = daysLeft(s.month, today);
  return spendingCategories().map((c) => {
    const spent = Math.max(0, s.byCategory[c.id] ?? 0);
    const limit = budgets[c.id];
    if (!limit) return { id: c.id, spent, used: 0, state: "none", left: 0, perDay: 0 };
    const used = spent / limit;
    const left = limit - spent;
    // Fixed needs (rent, bills) are expected to use their whole limit, so they only get flagged when they go over.
    const state: LimitState = used > 1 ? "over" : used >= alertAt && c.bucket === "wants" ? "warn" : "ok";
    return { id: c.id, spent, limit, used, state, left, perDay: days > 0 ? Math.max(0, left) / days : 0 };
  });
}

const RANK: Record<LimitState, number> = { none: 0, ok: 0, warn: 1, over: 2 };

/** Categories whose state got worse between two snapshots (used to fire alerts once, not on every refresh). */
export function newlyCrossed(before: LimitStatus[], after: LimitStatus[]): LimitStatus[] {
  const prev = new Map(before.map((s) => [s.id, s.state]));
  return after.filter((s) => RANK[s.state] > RANK[prev.get(s.id) ?? "none"]);
}
