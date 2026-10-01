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
import { APP_NAME } from "../src/brand";
import { decryptSecret, encryptSecret } from "./crypto";
import { save, store, type Item, type UserData } from "./store";

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

/** PLAID_WEBHOOK_URL, or on Render the service's own public URL. */
export function webhookUrl(): string | undefined {
  if (process.env.PLAID_WEBHOOK_URL) return process.env.PLAID_WEBHOOK_URL;
  if (process.env.RENDER_EXTERNAL_URL) return `${process.env.RENDER_EXTERNAL_URL}/api/plaid/webhook`;
  return undefined;
}

const plaidErrorCode = (e: unknown) => (e as { response?: { data?: { error_code?: string } } }).response?.data?.error_code;

export async function createLinkToken(userId: string) {
  const request = {
    user: { client_user_id: userId },
    client_name: APP_NAME,
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
    webhook: webhookUrl(),
    // Only needed for banks that send you to their own site to log in, when using the redirect flow
    // (the URI must also be registered in the Plaid dashboard). Without it Link uses a pop-up.
    redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
    transactions: { days_requested: 730 },
  };
  try {
    // Interest rates, minimum payments and due dates for cards and loans, where the bank supports it.
    const res = await client.linkTokenCreate({ ...request, required_if_supported_products: [Products.Liabilities] });
    return res.data.link_token;
  } catch (e) {
    // Your Plaid account may not have Liabilities turned on; connect with Transactions alone rather than fail.
    if (plaidErrorCode(e) !== "INVALID_PRODUCT") throw e;
    console.warn("[plaid] Liabilities isn't enabled for these keys; connecting without interest rates / due dates.");
    const res = await client.linkTokenCreate(request);
    return res.data.link_token;
  }
}

export async function exchangePublicToken(ud: UserData, publicToken: string, institution?: string) {
  const res = await client.itemPublicTokenExchange({ public_token: publicToken });
  const item: Item = { itemId: res.data.item_id, accessToken: encryptSecret(res.data.access_token), institution };
  ud.items = ud.items.filter((i) => i.itemId !== item.itemId).concat(item);
  store.plaidItemsCreated++;
  save();
  return item;
}

/** Disconnect at Plaid too, so the bank stops sharing data. */
export async function removeItem(item: Item): Promise<void> {
  if (!plaidConfigured) return;
  await client.itemRemove({ access_token: decryptSecret(item.accessToken) }).catch((e) => console.error("[plaid] remove failed:", plaidErrorCode(e) ?? e));
}

/** Point an item's webhook at this server (used after moving connections from another server). */
export async function updateWebhook(item: Item): Promise<void> {
  const webhook = webhookUrl();
  if (!plaidConfigured || !webhook) return;
  await client.itemWebhookUpdate({ access_token: decryptSecret(item.accessToken), webhook }).catch((e) => console.error("[plaid] webhook update failed:", plaidErrorCode(e) ?? e));
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
export async function syncItem(ud: UserData, item: Item): Promise<number> {
  let cursor = item.cursor;
  let changed = 0;
  let hasMore = true;
  const byId = new Map(ud.transactions.map((t) => [t.id, t]));
  const accessToken = decryptSecret(item.accessToken);
  while (hasMore) {
    const { data } = await client.transactionsSync({ access_token: accessToken, cursor, count: 500 });
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
      // Keep what Liabilities filled in (APR, due date…) until it's refreshed.
      const prev = ud.accounts.find((x) => x.id === acct.id);
      ud.accounts = ud.accounts.filter((x) => x.id !== acct.id).concat({ ...prev, ...acct });
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
  ud.transactions = [...byId.values()];
  await refreshLiabilities(ud, item);
  item.cursor = cursor;
  item.lastSync = new Date().toISOString();
  save();
  return changed;
}

export async function syncAll(ud: UserData): Promise<number> {
  let n = 0;
  for (const item of ud.items) {
    try {
      n += await syncItem(ud, item);
    } catch (e) {
      console.error(`[plaid] sync failed for ${item.institution ?? item.itemId}:`, (e as { response?: { data?: unknown } }).response?.data ?? e);
    }
  }
  return n;
}

const HALF_DAY = 12 * 60 * 60 * 1000;

/** Fill in APRs, minimum payments and due dates from Plaid Liabilities. Banks that don't support it are skipped quietly. */
async function refreshLiabilities(ud: UserData, item: Item, force = false): Promise<void> {
  if (!force && item.liabilitiesAt && Date.now() - Date.parse(item.liabilitiesAt) < HALF_DAY) return;
  try {
    const { data } = await client.liabilitiesGet({ access_token: decryptSecret(item.accessToken) });
    const patch = new Map<string, Partial<Account>>();
    for (const c of data.liabilities.credit ?? []) {
      if (!c.account_id) continue;
      const purchase = c.aprs.find((a) => a.apr_type === "purchase_apr") ?? c.aprs[0];
      patch.set(c.account_id, {
        apr: purchase?.apr_percentage ?? undefined,
        minPayment: c.minimum_payment_amount ?? undefined,
        nextDue: c.next_payment_due_date ?? undefined,
        statementBalance: c.last_statement_balance ?? undefined,
      });
    }
    for (const l of data.liabilities.student ?? []) {
      if (!l.account_id) continue;
      patch.set(l.account_id, {
        apr: l.interest_rate_percentage ?? undefined,
        minPayment: l.minimum_payment_amount ?? undefined,
        nextDue: l.next_payment_due_date ?? undefined,
      });
    }
    for (const m of data.liabilities.mortgage ?? []) {
      patch.set(m.account_id, {
        apr: m.interest_rate?.percentage ?? undefined,
        minPayment: m.next_monthly_payment ?? undefined,
        nextDue: m.next_payment_due_date ?? undefined,
      });
    }
    ud.accounts = ud.accounts.map((a) => (patch.has(a.id) ? { ...a, ...patch.get(a.id) } : a));
    item.liabilitiesAt = new Date().toISOString();
  } catch (e) {
    const code = plaidErrorCode(e);
    // Not every bank/account (or Plaid plan) supports Liabilities; don't retry those constantly.
    if (code === "PRODUCTS_NOT_SUPPORTED" || code === "NO_LIABILITY_ACCOUNTS" || code === "INVALID_PRODUCT" || code === "PRODUCT_NOT_ENABLED")
      item.liabilitiesAt = new Date().toISOString();
    else console.error(`[plaid] liabilities failed for ${item.institution ?? item.itemId}:`, code ?? e);
  }
}
