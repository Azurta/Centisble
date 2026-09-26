import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ServerStatus } from "./api";
import { DEFAULT_CATEGORIES, freeColorSlot, MISC_ID, newCategoryId, setCategories, type CategoryInfo } from "./lib/categories";
import { classifyAll, merchantKey } from "./lib/classify";
import { demoData } from "./lib/demo";
import { loadJson, saveJson } from "./lib/storage";
import { applyEdits } from "./lib/networth";
import type { SheetBalance } from "./lib/budgetSheet";
import type { HomeWidget } from "./components/Overview";
import type { Account, AccountEdits, Budgets, CategoryId, Overrides, Transaction, TxKind } from "./lib/types";

/** Hosted build without the sync server: spreadsheets, CSVs and manual entries only. */
export const STATIC = Boolean(import.meta.env.VITE_STATIC);

interface LocalData {
  accounts: Account[];
  transactions: Transaction[];
}

function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => loadJson(key, initial));
  useEffect(() => saveJson(key, value), [key, value]);
  return [value, setValue] as const;
}

export function useAppData() {
  const [local, setLocal] = usePersisted<LocalData>("azurta.local", { accounts: [], transactions: [] });
  const [overrides, setOverrides] = usePersisted<Overrides>("azurta.overrides", { category: {}, kind: {}, merchantRules: {} });
  const [budgets, setBudgets] = usePersisted<Budgets>("azurta.budgets", {});
  const [categories, setCategoryList] = usePersisted<CategoryInfo[]>("azurta.categories", DEFAULT_CATEGORIES);
  /** Warn when a category reaches this share of its limit. */
  const [homeLayout, setHomeLayout] = usePersisted<HomeWidget[]>("azurta.home", []);
  const [accountEdits, setAccountEdits] = usePersisted<AccountEdits>("azurta.accountEdits", {});
  const [alertAt, setAlertAt] = usePersisted<number>("azurta.alertAt", 0.8);
  // The classifier and analytics read the active list from the categories module.
  setCategories(categories);
  const [lessonsDone, setLessonsDone] = usePersisted<string[]>("azurta.lessons", []);
  const [videos, setVideos] = usePersisted<{ url: string; title: string }[]>("azurta.videos", []);

  const [server, setServer] = useState<LocalData>({ accounts: [], transactions: [] });
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (STATIC) return;
    try {
      const [s, data] = await Promise.all([api.status(), api.transactions()]);
      setStatus(s);
      setServer(data);
      setServerError(null);
      setLastUpdate(new Date());
    } catch (e) {
      setServerError((e as { status?: number }).status === 401 ? "unauthorized" : "offline");
    }
  }, []);

  // Live updates pushed from the server whenever the bank reports a new purchase.
  useEffect(() => {
    if (STATIC) return;
    refresh();
    let es: EventSource | undefined;
    try {
      es = api.events();
      es.addEventListener("transactions", () => refresh());
    } catch {
      /* no server */
    }
    const t = setInterval(refresh, 60_000);
    return () => {
      es?.close();
      clearInterval(t);
    };
  }, [refresh]);

  const accounts = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of [...local.accounts, ...server.accounts]) m.set(a.id, a);
    return applyEdits([...m.values()], accountEdits);
  }, [local.accounts, server.accounts, accountEdits]);

  const transactions = useMemo(() => {
    const m = new Map<string, Transaction>();
    for (const t of [...local.transactions, ...server.transactions]) m.set(t.id, t);
    return [...m.values()];
  }, [local.transactions, server.transactions]);

  const classified = useMemo(
    () => classifyAll(transactions, accounts, overrides).sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, accounts, overrides, categories],
  );

  const setCategory = (t: Transaction, category: CategoryId, rememberMerchant: boolean) =>
    setOverrides((o) => {
      const kind = { ...o.kind };
      delete kind[t.id];
      return {
        category: { ...o.category, [t.id]: category },
        kind,
        merchantRules: rememberMerchant ? { ...o.merchantRules, [merchantKey(t)]: category } : o.merchantRules,
      };
    });

  const addCategory = (c: Omit<CategoryInfo, "id" | "color">, limit?: number) => {
    const id = newCategoryId(c.label, categories);
    // New categories go before Misc so Misc stays last.
    setCategoryList((list) => {
      const created = { ...c, id, color: freeColorSlot(list) };
      const i = list.findIndex((x) => x.id === MISC_ID);
      return i < 0 ? [...list, created] : [...list.slice(0, i), created, ...list.slice(i)];
    });
    if (limit) setBudgets((b) => ({ ...b, [id]: limit }));
  };

  const updateCategory = (id: string, patch: Partial<CategoryInfo>) =>
    setCategoryList((list) => list.map((c) => (c.id === id ? { ...c, ...patch, id } : c)));

  /** Purchases in a deleted category move to Misc automatically. */
  const removeCategory = (id: string) => {
    if (id === MISC_ID) return;
    setCategoryList((list) => list.filter((c) => c.id !== id));
    setBudgets((b) => {
      const next = { ...b };
      delete next[id];
      return next;
    });
  };

  const setKind = (id: string, kind: TxKind | null) =>
    setOverrides((o) => {
      const next = { ...o.kind };
      if (kind) next[id] = kind;
      else delete next[id];
      return { ...o, kind: next };
    });

  const importTransactions = (account: Account, txs: Transaction[]) =>
    setLocal((l) => {
      const ids = new Set(l.transactions.map((t) => t.id));
      return {
        accounts: l.accounts.filter((a) => a.id !== account.id).concat(account),
        transactions: l.transactions.concat(txs.filter((t) => !ids.has(t.id))),
      };
    });

  /** Re-importing a month's sheet replaces that month's rows, so edits in the sheet carry over. */
  const importSheetMonths = (months: { month: string; transactions: Transaction[]; balances?: SheetBalance[] }[]) =>
    setLocal((l) => {
      const prefixes = months.map((m) => `sheet-${m.month}-`);
      const account: Account = { id: "sheet-budget", name: "Budget spreadsheets", type: "cash", source: "import" };
      // Balances come from the most recent month that lists any; they become editable accounts.
      const latest = [...months].sort((a, b) => b.month.localeCompare(a.month)).find((m) => m.balances?.length);
      const balanceAccounts: Account[] = (latest?.balances ?? []).map((b) => {
        const id = `sheet-bal-${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        const existing = l.accounts.find((a) => a.id === id);
        return {
          ...existing,
          id,
          name: existing?.name ?? b.name,
          type: b.type,
          source: "manual",
          balance: b.balance,
          balanceAsOf: `${latest!.month}-28T12:00:00Z`,
        };
      });
      const replaced = new Set([account.id, ...balanceAccounts.map((a) => a.id)]);
      return {
        accounts: l.accounts.filter((a) => !replaced.has(a.id)).concat(account, balanceAccounts),
        transactions: l.transactions
          .filter((t) => !prefixes.some((p) => t.id.startsWith(p)))
          .concat(months.flatMap((m) => m.transactions)),
      };
    });

  /** Add a debt or asset the bank connection doesn't cover (e.g. a student loan, cash, a 401k). */
  const addManualAccount = (a: Omit<Account, "id" | "source">) =>
    setLocal((l) => ({
      ...l,
      accounts: [...l.accounts, { ...a, id: `manual-acct-${Date.now()}`, source: "manual", balanceAsOf: new Date().toISOString() }],
    }));

  /** Accounts you added can change anything; bank accounts keep your name/APR/hidden edits on the side so syncs don't erase them. */
  const updateAccount = (id: string, patch: Partial<Account>) => {
    const own = local.accounts.find((a) => a.id === id);
    if (own && own.source !== "plaid") {
      const stamp = patch.balance != null ? { balanceAsOf: new Date().toISOString() } : {};
      setLocal((l) => ({ ...l, accounts: l.accounts.map((a) => (a.id === id ? { ...a, ...patch, ...stamp } : a)) }));
    } else {
      setAccountEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
    }
  };

  const removeAccount = (id: string) =>
    setLocal((l) => ({ accounts: l.accounts.filter((a) => a.id !== id), transactions: l.transactions.filter((t) => t.accountId !== id) }));

  const loadDemo = () => {
    const d = demoData();
    setLocal((l) => ({
      accounts: l.accounts.filter((a) => a.source !== "demo").concat(d.accounts),
      transactions: l.transactions.filter((t) => !t.id.startsWith("demo-")).concat(d.transactions),
    }));
  };
  const clearDemo = () =>
    setLocal((l) => ({ accounts: l.accounts.filter((a) => a.source !== "demo"), transactions: l.transactions.filter((t) => !t.id.startsWith("demo-")) }));

  const addManual = (t: Omit<Transaction, "id" | "accountId">) => {
    const account: Account = { id: "manual-cash", name: "Cash & manual entries", type: "cash", source: "import" };
    importTransactions(account, [{ ...t, id: `manual-${Date.now()}`, accountId: account.id }]);
  };

  return {
    accounts, classified, overrides, budgets, setBudgets,
    accountEdits, addManualAccount, updateAccount, homeLayout, setHomeLayout,
    categories, addCategory, updateCategory, removeCategory, alertAt, setAlertAt, lessonsDone, setLessonsDone, videos, setVideos,
    status, serverError, lastUpdate, refresh,
    setCategory, setKind, importTransactions, importSheetMonths, removeAccount, loadDemo, clearDemo, addManual,
    hasDemo: local.accounts.some((a) => a.source === "demo"),
  };
}

export type AppData = ReturnType<typeof useAppData>;
