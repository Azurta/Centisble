import { monthOf } from "./analytics";
import type { Account, ClassifiedTransaction } from "./types";

export const isDebt = (a: Account) => a.type === "credit" || a.type === "loan";

export interface DebtRow {
  account: Account;
  balance: number;
  apr?: number;
  /** What a month of interest costs at this balance and APR, if the balance isn't paid off. */
  monthlyInterest?: number;
  /** Interest and fees actually charged on this account this month (from transactions). */
  chargedThisMonth: number;
  /** Share of the credit limit in use (cards only) — under 30% is best for your credit score. */
  utilization?: number;
}

export interface NetWorth {
  assets: Account[];
  debts: DebtRow[];
  totalAssets: number;
  totalDebt: number;
  netWorth: number;
  /** Estimated interest per month across all debts that have an APR. */
  monthlyInterest: number;
  /** Accounts we don't have a balance for yet. */
  missingBalance: Account[];
}

export function netWorth(accounts: Account[], txs: ClassifiedTransaction[], month: string): NetWorth {
  const visible = accounts.filter((a) => !a.hidden && a.source !== "import");
  const withBalance = visible.filter((a) => a.balance != null);
  const assets = withBalance.filter((a) => !isDebt(a)).sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
  const charged = new Map<string, number>();
  for (const t of txs)
    if (t.kind === "interest" && monthOf(t.date) === month) charged.set(t.accountId, (charged.get(t.accountId) ?? 0) + t.amount);

  const debts: DebtRow[] = withBalance
    .filter(isDebt)
    .map((a) => {
      const balance = a.balance ?? 0;
      return {
        account: a,
        balance,
        apr: a.apr,
        monthlyInterest: a.apr != null ? (balance * a.apr) / 100 / 12 : undefined,
        chargedThisMonth: charged.get(a.id) ?? 0,
        utilization: a.type === "credit" && a.creditLimit ? balance / a.creditLimit : undefined,
      };
    })
    .sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0) || b.balance - a.balance);

  const totalAssets = assets.reduce((s, a) => s + (a.balance ?? 0), 0);
  const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
  return {
    assets,
    debts,
    totalAssets,
    totalDebt,
    netWorth: totalAssets - totalDebt,
    monthlyInterest: debts.reduce((s, d) => s + (d.monthlyInterest ?? 0), 0),
    missingBalance: visible.filter((a) => a.balance == null),
  };
}

/** Apply your edits on top of what the bank reports. */
export function applyEdits(accounts: Account[], edits: Record<string, Partial<Account>>): Account[] {
  return accounts.map((a) => (edits[a.id] ? { ...a, ...edits[a.id], id: a.id } : a));
}
