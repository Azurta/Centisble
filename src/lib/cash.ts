import type { Account, ClassifiedTransaction } from "./types";

/**
 * The cash wallet: physical cash you have on hand. You set how much you have, log cash you get and spend,
 * and ATM withdrawals / cash deposits at your bank move money into and out of it by themselves.
 */
export const CASH_WALLET_ID = "cash-wallet";

/** Taking cash out at an ATM or teller (not the ATM's fee). */
export const CASH_WITHDRAWAL = /^(?!.*\bfee\b).*(\batm\b|cash\s*withdrawal|withdrawal\s*(at\s*)?(branch|teller)|teller\s*withdrawal)/i;
/** Putting cash into the bank. */
export const CASH_DEPOSIT = /^(?!.*\bfee\b).*(cash\s*dep|deposit\s*(of\s*)?cash|\batm\b.*dep|branch\s*dep|teller\s*dep|counter\s*dep)/i;

export const isWalletEntry = (t: { accountId: string }) => t.accountId === CASH_WALLET_ID;

/** When a wallet entry was made (entries carry their creation time in their id). */
const entryTime = (id: string) => Number(id.split("-")[1]) || 0;

/**
 * Cash on hand now: the amount you last counted, plus what came in and minus what went out since then.
 * Bank withdrawals/deposits count from the day after the count (they only carry a date).
 */
export function walletBalance(wallet: Account, txs: ClassifiedTransaction[]): number {
  const countedAt = wallet.balanceAsOf ? Date.parse(wallet.balanceAsOf) : 0;
  const countedDay = wallet.balanceAsOf?.slice(0, 10) ?? "";
  let balance = wallet.balance ?? 0;
  for (const t of txs) {
    if (isWalletEntry(t)) {
      if (entryTime(t.id) > countedAt) balance -= t.amount;
    } else if (t.cashMove && t.date > countedDay) {
      balance += t.amount; // a withdrawal (positive amount) adds cash; a deposit (negative amount) takes it away
    }
  }
  return Math.round(balance * 100) / 100;
}

/** Recent cash activity: your entries plus ATM withdrawals and cash deposits, newest first. */
export function walletActivity(txs: ClassifiedTransaction[], limit = 8): ClassifiedTransaction[] {
  return txs
    .filter((t) => isWalletEntry(t) || t.cashMove)
    .sort((a, b) => b.date.localeCompare(a.date) || entryTime(b.id) - entryTime(a.id))
    .slice(0, limit);
}
