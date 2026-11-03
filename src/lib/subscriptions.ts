import { monthOf, monthsIn } from "./analytics";
import { merchantKey } from "./classify";
import type { CategoryId, ClassifiedTransaction } from "./types";

/**
 * Subscriptions and other repeating charges, with price increases spotted
 * ("Netflix went from $15.49 to $17.99") and a link to cancel where we know one.
 */
export interface Subscription {
  key: string;
  label: string;
  /** The latest charge. */
  amount: number;
  category: CategoryId;
  /** How many of the recent months it was charged in. */
  months: number;
  lastDate: string;
  /** Set when the latest charge is higher than the steady price before it. */
  increase?: { from: number; to: number; date: string };
  cancelUrl?: string;
  /** "subscription" for services you can cancel; "bill" for steady bills like insurance or a phone plan. */
  type: "subscription" | "bill";
}

/* Habit spending repeats too, but it isn't a subscription. */
const NOT_SUBSCRIPTIONS = new Set(["groceries", "going_out", "alcohol", "rent", "debt", "shopping"]);
const LOANS = /\bloan\b|mortgage|financial|lending|\bfinance\b/i;
const GAS = /gas|fuel|shell|chevron|exxon|mobil\b|wawa|sheetz|speedway|valero|arco/i;

/** Account pages where the service can be cancelled. */
const CANCEL_PAGES: [RegExp, string][] = [
  [/netflix/i, "https://www.netflix.com/cancelplan"],
  [/spotify/i, "https://www.spotify.com/account/subscription/"],
  [/hulu/i, "https://secure.hulu.com/account"],
  [/disney/i, "https://www.disneyplus.com/account"],
  [/\bmax\b|hbo/i, "https://auth.max.com/subscription"],
  [/youtube/i, "https://www.youtube.com/paid_memberships"],
  [/amazon\s*prime|prime\s*video|amzn\s*prime/i, "https://www.amazon.com/mc"],
  [/apple\.com|itunes|icloud/i, "https://support.apple.com/en-us/118428"],
  [/paramount/i, "https://www.paramountplus.com/account/"],
  [/peacock/i, "https://www.peacocktv.com/account"],
  [/audible/i, "https://www.audible.com/account/overview"],
  [/xbox/i, "https://account.microsoft.com/services"],
  [/playstation/i, "https://www.playstation.com/en-us/support/subscriptions/cancel-playstation-subscription/"],
  [/chatgpt|openai/i, "https://help.openai.com/en/articles/7232927"],
  [/adobe/i, "https://account.adobe.com/plans"],
  [/dropbox/i, "https://www.dropbox.com/account/plan"],
  [/planet\s*fitness/i, "https://www.planetfitness.com/about-planet-fitness/customer-service"],
];

export const cancelUrlFor = (text: string) => CANCEL_PAGES.find(([re]) => re.test(text))?.[1];

/** Charges from one merchant in at least 2 of the last 6 months, about once a month. */
export function findSubscriptions(all: ClassifiedTransaction[], month: string): Subscription[] {
  const recent = new Set(monthsIn(all).filter((m) => m <= month).slice(0, 6));
  const groups = new Map<string, ClassifiedTransaction[]>();
  for (const t of all) {
    if (t.kind !== "expense" || !recent.has(monthOf(t.date))) continue;
    if (NOT_SUBSCRIPTIONS.has(t.category) || GAS.test(t.description) || LOANS.test(t.description)) continue;
    const k = merchantKey(t);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  const out: Subscription[] = [];
  for (const [key, txs] of groups) {
    const months = new Set(txs.map((t) => monthOf(t.date)));
    if (months.size < 2 || txs.length > months.size + 1) continue; // frequent shopping isn't a subscription
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const before = sorted.slice(0, -1).map((t) => t.amount);
    const typical = median(before);
    // Steady before (within 5%), so a jump means a new price, not a bill that varies (like electricity).
    const steady = before.every((a) => Math.abs(a - typical) <= Math.max(0.5, typical * 0.05));
    const jumped = latest.amount - typical >= Math.max(0.5, typical * 0.03);
    // A charge that swings around from month to month (utilities, shopping) isn't a subscription.
    if (!steady) continue;
    const label = latest.merchant || latest.description;
    const cancelUrl = cancelUrlFor(`${latest.merchant ?? ""} ${latest.description}`);
    out.push({
      type: cancelUrl || latest.category === "subscriptions" || latest.category === "entertainment" ? "subscription" : "bill",
      key,
      label,
      amount: latest.amount,
      category: latest.category,
      months: months.size,
      lastDate: latest.date,
      increase: steady && jumped ? { from: typical, to: latest.amount, date: latest.date } : undefined,
      cancelUrl,
    });
  }
  return out.sort((a, b) => Number(Boolean(b.increase)) - Number(Boolean(a.increase)) || b.amount - a.amount);
}

/** Price increases charged on or after `since` (YYYY-MM-DD). */
export function recentIncreases(subs: Subscription[], since: string): Subscription[] {
  return subs.filter((s) => s.increase && s.increase.date >= since);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Subscriptions that stopped: a steady monthly charge (2+ months) with nothing in the last 45 days.
 * Each one counts toward "Avryo found you $___" as its yearly cost.
 */
export function stoppedSubscriptions(all: ClassifiedTransaction[], today = new Date()): { key: string; label: string; amount: number; lastDate: string; yearly: number }[] {
  const cutoff = new Date(today.getTime() - 45 * 86_400_000).toISOString().slice(0, 10);
  const since = new Date(today.getTime() - 240 * 86_400_000).toISOString().slice(0, 10);
  const groups = new Map<string, ClassifiedTransaction[]>();
  for (const t of all) {
    if (t.kind !== "expense" || t.date < since) continue;
    if (NOT_SUBSCRIPTIONS.has(t.category) || GAS.test(t.description) || LOANS.test(t.description)) continue;
    const k = merchantKey(t);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  const out = [];
  for (const [key, txs] of groups) {
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const months = new Set(sorted.map((t) => monthOf(t.date)));
    if (months.size < 2 || sorted.length > months.size + 1 || last.date >= cutoff) continue;
    const typical = median(sorted.map((t) => t.amount));
    if (!sorted.every((t) => Math.abs(t.amount - typical) <= Math.max(0.5, typical * 0.05))) continue;
    out.push({ key, label: last.merchant || last.description, amount: typical, lastDate: last.date, yearly: Math.round(typical * 12 * 100) / 100 });
  }
  return out.sort((a, b) => b.yearly - a.yearly);
}
