/**
 * SimpleFIN Bridge (https://bridge.simplefin.org): a low-cost, read-only bank feed (~$15/year per person, up to 25 banks).
 * You create a Setup Token on their site, paste it into the app once, and we exchange it for a private Access URL.
 * Data refreshes about once a day, so this is "automatic" daily rather than within minutes like Plaid webhooks.
 */
import type { Account, AccountType, Transaction } from "../src/lib/types";
import { decryptSecret } from "./crypto";
import { save, type UserData } from "./store";

export interface SimplefinConnection {
  /** Encrypted at rest (see crypto.ts). */
  accessUrl: string;
  lastSync?: string;
  institutions?: string[];
  errors?: string[];
}

interface SfTransaction {
  id: string;
  posted: number;
  amount: string;
  description: string;
  payee?: string;
  memo?: string;
  pending?: boolean;
  transacted_at?: number;
}
interface SfAccount {
  org: { name?: string; domain?: string };
  id: string;
  name: string;
  currency: string;
  balance: string;
  "available-balance"?: string;
  "balance-date": number;
  transactions?: SfTransaction[];
}
export interface SfResponse {
  errors?: string[];
  accounts: SfAccount[];
}

/** The Setup Token is a base64-encoded claim URL; claiming it (once) returns the Access URL. */
export async function claimSetupToken(setupToken: string): Promise<string> {
  let claimUrl: string;
  try {
    claimUrl = Buffer.from(setupToken.trim(), "base64").toString("utf8");
    new URL(claimUrl);
  } catch {
    throw new Error("That doesn't look like a SimpleFIN Setup Token.");
  }
  const res = await fetch(claimUrl, { method: "POST", headers: { "Content-Length": "0" } });
  if (!res.ok) throw new Error(res.status === 403 ? "This Setup Token was already used or has expired. Create a new one." : `SimpleFIN said ${res.status}.`);
  return (await res.text()).trim();
}

/** Node's fetch refuses URLs with user:pass@, so move them into a Basic auth header. */
function authed(accessUrl: string, path: string): { url: string; headers: Record<string, string> } {
  const u = new URL(accessUrl);
  const auth = Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString("base64");
  u.username = "";
  u.password = "";
  return { url: `${u.toString().replace(/\/$/, "")}${path}`, headers: { Authorization: `Basic ${auth}` } };
}

const CREDIT = /credit|card|visa|master\s*card|amex|american express|discover|sapphire|freedom|quicksilver|savor|venture|platinum|rewards/i;
const LOAN = /loan|mortgage|auto|student|heloc|line of credit/i;
const SAVINGS = /saving|money market|\bcd\b|certificate|brokerage|ira\b|401|invest/i;

export function accountTypeFor(a: Pick<SfAccount, "name" | "balance"> & { org?: { name?: string } }): AccountType {
  const text = `${a.name} ${a.org?.name ?? ""}`;
  if (LOAN.test(a.name)) return "loan";
  if (CREDIT.test(a.name)) return "credit";
  if (SAVINGS.test(a.name)) return "savings";
  if (parseFloat(a.balance) < 0 && CREDIT.test(text)) return "credit";
  return "checking";
}

const isoDate = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

/** Convert SimpleFIN's shapes to ours. SimpleFIN amounts are negative for money out; ours are positive. */
export function mapSimplefin(data: SfResponse): { accounts: Account[]; transactions: Transaction[] } {
  const accounts: Account[] = [];
  const transactions: Transaction[] = [];
  for (const a of data.accounts) {
    const type = accountTypeFor(a);
    const debt = type === "credit" || type === "loan";
    const bal = parseFloat(a.balance);
    const id = `sf-${a.id}`;
    accounts.push({
      id,
      name: a.org?.name && !a.name.toLowerCase().includes(a.org.name.toLowerCase()) ? `${a.org.name} ${a.name}` : a.name,
      type,
      source: "plaid", // bank-connected: the balance comes from the bank, not from you
      balance: debt ? Math.abs(bal) : bal,
      available: a["available-balance"] != null ? Math.abs(parseFloat(a["available-balance"])) : undefined,
      balanceAsOf: new Date(a["balance-date"] * 1000).toISOString(),
    });
    for (const t of a.transactions ?? []) {
      transactions.push({
        id: `sf-${a.id}-${t.id}`,
        accountId: id,
        date: isoDate(t.transacted_at || t.posted),
        description: t.description || t.memo || t.payee || "Transaction",
        merchant: t.payee || undefined,
        amount: -parseFloat(t.amount),
        pending: t.pending || t.posted === 0 || undefined,
      });
    }
  }
  return { accounts, transactions };
}

const DAY = 86_400;

/** Pull accounts and recent transactions. First sync looks back 90 days, later ones 14 (to catch late-posting items). */
export async function syncSimplefin(ud: UserData): Promise<number> {
  const conn = ud.simplefin;
  if (!conn) return 0;
  const lookback = conn.lastSync ? 14 : 90;
  const start = Math.floor(Date.now() / 1000) - lookback * DAY;
  const { url, headers } = authed(decryptSecret(conn.accessUrl), `/accounts?start-date=${start}&pending=1`);
  const res = await fetch(url, { headers });
  if (res.status === 403) {
    conn.errors = ["SimpleFIN access was revoked. Connect again with a new Setup Token."];
    save();
    return 0;
  }
  if (!res.ok) throw new Error(`SimpleFIN ${res.status}`);
  const data = (await res.json()) as SfResponse;
  const mapped = mapSimplefin(data);

  const startDate = isoDate(start);
  const accountIds = new Set(mapped.accounts.map((a) => a.id));
  // Pending items in the window are replaced by whatever SimpleFIN reports now.
  const kept = ud.transactions.filter((t) => !(accountIds.has(t.accountId) && t.pending && t.date >= startDate));
  const byId = new Map(kept.map((t) => [t.id, t]));
  let changed = 0;
  for (const t of mapped.transactions) {
    const prev = byId.get(t.id);
    if (!prev || prev.amount !== t.amount || prev.pending !== t.pending) changed++;
    byId.set(t.id, t);
  }
  ud.transactions = [...byId.values()];
  for (const a of mapped.accounts) {
    const prev = ud.accounts.find((x) => x.id === a.id);
    ud.accounts = ud.accounts.filter((x) => x.id !== a.id).concat({ ...prev, ...a });
  }
  conn.lastSync = new Date().toISOString();
  conn.institutions = [...new Set(data.accounts.map((a) => a.org?.name).filter((n): n is string => Boolean(n)))];
  conn.errors = data.errors?.length ? data.errors : undefined;
  save();
  return changed;
}
