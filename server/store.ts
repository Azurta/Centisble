/**
 * Everything the server keeps, in one JSON file on disk (fine for a family-sized app).
 * Each person's banks, transactions and settings live in their own `UserData`, keyed by user id.
 */
import fs from "node:fs";
import path from "node:path";
import type { Account, Transaction } from "../src/lib/types";
import { encryptSecret, isEncrypted, randomToken } from "./crypto";
import type { SimplefinConnection } from "./simplefin";

export interface Item {
  itemId: string;
  /** Encrypted at rest (see crypto.ts). */
  accessToken: string;
  institution?: string;
  cursor?: string;
  lastSync?: string;
  /** When interest rates / due dates were last fetched (they change rarely, so at most twice a day). */
  liabilitiesAt?: string;
}

/** One person's financial data and app settings. */
export interface UserData {
  items: Item[];
  accounts: Account[];
  transactions: Transaction[];
  /** App settings (categories, limits, edits, home layout…) shared by every device this person uses. */
  settings?: Record<string, unknown>;
  settingsUpdatedAt?: string;
  simplefin?: SimplefinConnection;
  /** Limit alert state last notified, so push notifications fire once per crossing. */
  alertStates?: Record<string, string>;
  alertMonth?: string;
  /** Bill reminders already sent, e.g. "bill-123:2026-10:soon". */
  billReminders?: string[];
  /** Secret part of this person's bills calendar link (/api/calendar/<token>.ics); none = calendar link off. */
  calendarToken?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  /** Empty for people who only sign in with Google. */
  passwordHash: string;
  /** Google account id, once they've used "Continue with Google". */
  googleSub?: string;
  role: "owner" | "member";
  createdAt: string;
}

export interface Session {
  /** sha256 of the cookie value — the cookie itself is never stored. */
  idHash: string;
  userId: string;
  expiresAt: string;
}

export interface PushSubscriptionRecord {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}

interface Store {
  version: 2;
  users: User[];
  sessions: Session[];
  data: Record<string, UserData>;
  /** Invite code family members need to sign up. The owner can change it. */
  inviteCode: string;
  /** Emails the owner has approved; they can sign up without an invite code. */
  allowedEmails: string[];
  /** Plaid connections ever created (the Trial plan counts creations, not current connections). */
  plaidItemsCreated: number;
  push: PushSubscriptionRecord[];
  /** Password-reset links sent by email (only a hash of each link's secret is kept; they expire after an hour). */
  resets?: { idHash: string; userId: string; expiresAt: string }[];
  vapid?: { publicKey: string; privateKey: string };
  /** Data from the single-user version, handed to the first account created. */
  legacy?: UserData;
}

const file = path.resolve(process.env.DATA_DIR ?? "data", "db.json");

export const emptyUserData = (): UserData => ({ items: [], accounts: [], transactions: [] });

function load(): Store {
  let raw: Record<string, unknown> | undefined;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* first run */
  }
  const base: Store = { version: 2, users: [], sessions: [], data: {}, inviteCode: randomToken(9), allowedEmails: [], plaidItemsCreated: 0, push: [] };
  if (!raw) return base;
  if (raw.version === 2) return { ...base, ...(raw as unknown as Store) };
  // Single-user file from before accounts existed: keep it for whoever signs up first.
  const legacy = raw as unknown as UserData;
  return { ...base, legacy, plaidItemsCreated: legacy.items?.length ?? 0 };
}

export const store: Store = load();

/** Encrypt any secrets still stored in plain text (older versions). */
function encryptAll(u: UserData) {
  for (const i of u.items) if (!isEncrypted(i.accessToken)) i.accessToken = encryptSecret(i.accessToken);
  if (u.simplefin && !isEncrypted(u.simplefin.accessUrl)) u.simplefin.accessUrl = encryptSecret(u.simplefin.accessUrl);
}
for (const u of Object.values(store.data)) encryptAll(u);
if (store.legacy) encryptAll(store.legacy);

export function userData(userId: string): UserData {
  return (store.data[userId] ??= emptyUserData());
}

/** Find which person a Plaid item belongs to (webhooks only tell us the item). */
export function findItem(itemId: string): { userId: string; data: UserData; item: Item } | undefined {
  for (const [userId, data] of Object.entries(store.data)) {
    const item = data.items.find((i) => i.itemId === itemId);
    if (item) return { userId, data, item };
  }
  return undefined;
}

let timer: NodeJS.Timeout | undefined;
/** Write to disk (atomically, owner-readable only). Calls within 200 ms are batched. */
export function save(now = false) {
  const write = () => {
    timer = undefined;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  if (now) {
    if (timer) clearTimeout(timer);
    return write();
  }
  timer ??= setTimeout(write, 200);
}
