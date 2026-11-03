/** Savings goals: a target amount, optionally by a date, funded by hand or tracked from a savings account's balance. */
import type { Account } from "./types";

export interface Goal {
  id: string;
  name: string;
  target: number;
  /** Money set aside so far (when not linked to an account). */
  saved: number;
  /** Track progress from this account's balance instead (e.g. a high-yield savings account). */
  accountId?: string;
  /** YYYY-MM to reach it by. */
  deadline?: string;
  /** When it was first reached (YYYY-MM-DD): the celebration shows once. */
  reachedAt?: string;
  /** Shared to the household milestones hub. */
  shared?: boolean;
}

/** Points toward the Money Score for goals reached this year (3 each, up to 9). */
export const goalPoints = (goals: Goal[], year = new Date().getFullYear()) =>
  Math.min(9, goals.filter((g) => g.reachedAt?.startsWith(String(year))).length * 3);

export interface GoalProgress {
  goal: Goal;
  saved: number;
  share: number;
  left: number;
  monthsLeft?: number;
  /** What you'd need to add each month to hit the deadline. */
  perMonth?: number;
  done: boolean;
}

export function goalProgress(goal: Goal, accounts: Account[], today = new Date()): GoalProgress {
  const linked = goal.accountId ? accounts.find((a) => a.id === goal.accountId) : undefined;
  const saved = Math.max(0, linked ? (linked.balance ?? 0) : goal.saved);
  const left = Math.max(0, goal.target - saved);
  let monthsLeft: number | undefined;
  if (goal.deadline) {
    const [y, m] = goal.deadline.split("-").map(Number);
    monthsLeft = Math.max(0, (y - today.getUTCFullYear()) * 12 + (m - 1 - today.getUTCMonth()) + 1);
  }
  return {
    goal,
    saved,
    left,
    share: goal.target > 0 ? Math.min(1, saved / goal.target) : 0,
    monthsLeft,
    perMonth: monthsLeft ? left / monthsLeft : monthsLeft === 0 && left > 0 ? left : undefined,
    done: left <= 0,
  };
}
