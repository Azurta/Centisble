import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ServerStatus } from "./api";
import { classifyAll, merchantKey } from "./lib/classify";
import { demoData } from "./lib/demo";
import { loadJson, saveJson } from "./lib/storage";
import type { Account, Budgets, CategoryId, Overrides, Transaction, TxKind } from "./lib/types";

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
    return [...m.values()];
  }, [local.accounts, server.accounts]);

  const transactions = useMemo(() => {
    const m = new Map<string, Transaction>();
    for (const t of [...local.transactions, ...server.transactions]) m.set(t.id, t);
    return [...m.values()];
  }, [local.transactions, server.transactions]);

  const classified = useMemo(
    () => classifyAll(transactions, accounts, overrides).sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, accounts, overrides],
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
  const importSheetMonths = (months: { month: string; transactions: Transaction[] }[]) =>
    setLocal((l) => {
      const prefixes = months.map((m) => `sheet-${m.month}-`);
      const account: Account = { id: "sheet-budget", name: "Budget spreadsheets", type: "cash", source: "import" };
      return {
        accounts: l.accounts.filter((a) => a.id !== account.id).concat(account),
        transactions: l.transactions
          .filter((t) => !prefixes.some((p) => t.id.startsWith(p)))
          .concat(months.flatMap((m) => m.transactions)),
      };
    });

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
    accounts, classified, overrides, budgets, setBudgets, lessonsDone, setLessonsDone, videos, setVideos,
    status, serverError, lastUpdate, refresh,
    setCategory, setKind, importTransactions, importSheetMonths, removeAccount, loadDemo, clearDemo, addManual,
    hasDemo: local.accounts.some((a) => a.source === "demo"),
  };
}

export type AppData = ReturnType<typeof useAppData>;
