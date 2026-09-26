import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type AccountBase,
  type Transaction as PlaidTx,
} from "plaid";
import type { Account, AccountType, Transaction } from "../src/lib/types";
import { db, save, type Item } from "./store";

export const plaidConfigured = Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);

const client = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV ?? "sandbox"] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
        "PLAID-SECRET": process.env.PLAID_SECRET ?? "",
      },
    },
  }),
);

export async function createLinkToken(userId: string) {
  const res = await client.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "Centsible",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
    webhook: process.env.PLAID_WEBHOOK_URL || undefined,
    transactions: { days_requested: 730 },
  });
  return res.data.link_token;
}

export async function exchangePublicToken(publicToken: string, institution?: string) {
  const res = await client.itemPublicTokenExchange({ public_token: publicToken });
  const item: Item = { itemId: res.data.item_id, accessToken: res.data.access_token, institution };
  db.items = db.items.filter((i) => i.itemId !== item.itemId).concat(item);
  save();
  return item;
}

function accountType(a: AccountBase): AccountType {
  if (a.type === "credit") return "credit";
  if (a.type === "loan") return "loan";
  if (a.type === "depository") return a.subtype === "savings" || a.subtype === "money market" || a.subtype === "cd" ? "savings" : "checking";
  if (a.type === "investment") return "savings";
  return "checking";
}

function toTransaction(t: PlaidTx): Transaction {
  return {
    id: t.transaction_id,
    accountId: t.account_id,
    date: t.authorized_date ?? t.date,
    description: t.name,
    merchant: t.merchant_name ?? undefined,
    amount: t.amount,
    pending: t.pending,
    bankCategory: t.personal_finance_category
      ? { primary: t.personal_finance_category.primary, detailed: t.personal_finance_category.detailed }
      : undefined,
  };
}

/** Pull everything new since the last cursor. Returns how many transactions changed. */
export async function syncItem(item: Item): Promise<number> {
  let cursor = item.cursor;
  let changed = 0;
  let hasMore = true;
  const byId = new Map(db.transactions.map((t) => [t.id, t]));
  while (hasMore) {
    const { data } = await client.transactionsSync({ access_token: item.accessToken, cursor, count: 500 });
    for (const a of data.accounts) {
      const acct: Account = {
        id: a.account_id,
        name: `${item.institution ?? "Bank"} ${a.name}${a.mask ? ` ••${a.mask}` : ""}`,
        type: accountType(a),
        source: "plaid",
        // Plaid reports what you owe on cards/loans as a positive `current` balance, same as our convention.
        balance: a.balances.current ?? undefined,
        available: a.balances.available ?? undefined,
        creditLimit: a.balances.limit ?? undefined,
        balanceAsOf: new Date().toISOString(),
      };
      db.accounts = db.accounts.filter((x) => x.id !== acct.id).concat(acct);
    }
    for (const t of [...data.added, ...data.modified]) {
      // A posted transaction replaces its pending version.
      if (t.pending_transaction_id) byId.delete(t.pending_transaction_id);
      byId.set(t.transaction_id, toTransaction(t));
      changed++;
    }
    for (const r of data.removed) {
      if (r.transaction_id && byId.delete(r.transaction_id)) changed++;
    }
    cursor = data.next_cursor;
    hasMore = data.has_more;
  }
  db.transactions = [...byId.values()];
  item.cursor = cursor;
  item.lastSync = new Date().toISOString();
  save();
  return changed;
}

export async function syncAll(): Promise<number> {
  let n = 0;
  for (const item of db.items) {
    try {
      n += await syncItem(item);
    } catch (e) {
      console.error(`[plaid] sync failed for ${item.institution ?? item.itemId}:`, (e as { response?: { data?: unknown } }).response?.data ?? e);
    }
  }
  return n;
}
