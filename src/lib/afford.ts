import type { Goal } from "./goals";
import type { SafeToSpend } from "./safeToSpend";
import type { ClassifiedTransaction } from "./types";

/** "Can I afford it?": what a purchase does to what's safe to spend until payday. */
export interface AffordAnswer {
  verdict: "yes" | "tight" | "no";
  /** What's left until payday after buying it. */
  left: number;
  leftPerDay: number;
  /** Your usual everyday spending per day (last 30 days, bills and rent left out). */
  usualPerDay: number;
  /** Goals that already hold enough to pay for it. */
  fromGoals: { name: string; saved: number }[];
}

/* Fixed costs are already counted in safe-to-spend; everyday spending is what has to fit in what's left. */
const FIXED = new Set(["rent", "debt", "bills", "subscriptions", "car"]);

export function usualDailySpend(txs: ClassifiedTransaction[], today = new Date()): number {
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const total = txs
    .filter((t) => t.kind === "expense" && t.date > start && t.date <= end && !FIXED.has(t.category))
    .reduce((s, t) => s + t.amount, 0);
  return Math.round((total / 30) * 100) / 100;
}

export function canAfford(price: number, safe: SafeToSpend, usualPerDay: number, goals: { name: string; saved: number }[] = []): AffordAnswer {
  const left = Math.round((safe.safe - price) * 100) / 100;
  const leftPerDay = Math.round((left / safe.days) * 100) / 100;
  const verdict = left < 0 ? "no" : leftPerDay >= usualPerDay ? "yes" : "tight";
  return { verdict, left, leftPerDay, usualPerDay, fromGoals: goals.filter((g) => g.saved >= price) };
}

/** Goals' current savings, for "or pay for it from a goal". */
export const goalSavings = (goals: Goal[], saved: (g: Goal) => number) => goals.map((g) => ({ name: g.name, saved: saved(g) }));
