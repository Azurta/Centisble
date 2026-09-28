/**
 * Phone / desktop notifications that arrive even when the app is closed (Web Push).
 * Keys are created once and kept in the store. After each sync we re-check the person's limits
 * and notify only when a category newly crosses its warning line or goes over.
 */
import webpush from "web-push";
import { summarize } from "../src/lib/analytics";
import { setCategories, categoryInfo, DEFAULT_CATEGORIES, type CategoryInfo } from "../src/lib/categories";
import { classifyAll } from "../src/lib/classify";
import { limitStatuses } from "../src/lib/limits";
import { applyEdits } from "../src/lib/networth";
import type { Account, AccountEdits, Budgets, Overrides, Transaction } from "../src/lib/types";
import { save, store, type UserData } from "./store";

function vapid() {
  if (!store.vapid) {
    store.vapid = webpush.generateVAPIDKeys();
    save();
  }
  return store.vapid;
}

export const vapidPublicKey = () => vapid().publicKey;

export function subscribe(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  store.push = store.push.filter((s) => s.endpoint !== sub.endpoint).concat({ userId, endpoint: sub.endpoint, keys: sub.keys, createdAt: new Date().toISOString() });
  save();
}

export function unsubscribe(endpoint: string) {
  store.push = store.push.filter((s) => s.endpoint !== endpoint);
  save();
}

export async function notify(userId: string, title: string, body: string, url = "/") {
  const { publicKey, privateKey } = vapid();
  const subject = process.env.RENDER_EXTERNAL_URL ?? "mailto:admin@localhost";
  for (const s of store.push.filter((p) => p.userId === userId)) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title, body, url }), {
        vapidDetails: { subject, publicKey, privateKey },
        TTL: 60 * 60 * 12,
      });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // 404/410: the browser dropped this subscription (app removed, permission revoked).
      if (code === 404 || code === 410) unsubscribe(s.endpoint);
      else console.error("[push] failed:", code ?? e);
    }
  }
}

interface SyncedSettings {
  local?: { accounts: Account[]; transactions: Transaction[] };
  overrides?: Overrides;
  budgets?: Budgets;
  categories?: CategoryInfo[];
  alertAt?: number;
  accountEdits?: AccountEdits;
}

const RANK: Record<string, number> = { none: 0, ok: 0, warn: 1, over: 2 };

/** Re-check this person's limits for the current month and notify about new warnings / overages. */
export async function checkLimits(userId: string, ud: UserData): Promise<void> {
  if (!store.push.some((p) => p.userId === userId)) return;
  const s = (ud.settings ?? {}) as SyncedSettings;
  if (!s.budgets || !Object.keys(s.budgets).length) return;
  const month = new Date().toISOString().slice(0, 7);
  if (ud.alertMonth !== month) {
    ud.alertMonth = month;
    ud.alertStates = {};
  }
  // Same inputs the app uses on screen, so alerts match what you see.
  setCategories(s.categories ?? DEFAULT_CATEGORIES);
  const accounts = applyEdits([...(s.local?.accounts ?? []), ...ud.accounts], s.accountEdits ?? {});
  const txs = [...(s.local?.transactions ?? []), ...ud.transactions];
  const statuses = limitStatuses(summarize(classifyAll(txs, accounts, s.overrides), month), s.budgets, s.alertAt ?? 0.8);
  const prev = ud.alertStates ?? {};
  const crossed = statuses.filter((x) => RANK[x.state] > RANK[prev[x.id] ?? "none"]);
  ud.alertStates = Object.fromEntries(statuses.map((x) => [x.id, x.state]));
  save();
  for (const x of crossed) {
    const c = categoryInfo(x.id);
    const limit = x.limit ?? 0;
    if (x.state === "over") await notify(userId, `${c.label} is over its limit`, `$${Math.round(x.spent)} spent of $${Math.round(limit)} this month.`);
    else await notify(userId, `${c.label}: ${Math.round(x.used * 100)}% of your limit`, `$${Math.round(x.left)} left for the month.`);
  }
}
