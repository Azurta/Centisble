import { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "./brand";
import { Accounts } from "./components/Accounts";
import { Categories } from "./components/Categories";
import { Insights } from "./components/Insights";
import { Learn } from "./components/Learn";
import { Overview } from "./components/Overview";
import { Transactions, type TxFilter } from "./components/Transactions";
import { monthLabel } from "./format";
import { findRecurring, monthsIn, moneyScore, savingTips, summarize, trend } from "./lib/analytics";
import { categoryInfo } from "./lib/categories";
import { limitStatuses, newlyCrossed, type LimitStatus } from "./lib/limits";
import { netWorth } from "./lib/networth";
import type { Account } from "./lib/types";
import type { Nav } from "./components/Overview";
import { usd } from "./format";
import { useAppData } from "./useAppData";

const TABS = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "transactions", label: "Transactions", icon: "🧾" },
  { id: "insights", label: "Save", icon: "💡" },
  { id: "categories", label: "Categories & Limits", icon: "🎯" },
  { id: "learn", label: "Learn", icon: "🎓" },
  { id: "accounts", label: "Accounts", icon: "🏦" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function App() {
  const data = useAppData();
  const [tab, setTab] = useState<Tab>("overview");
  const [lessonFocus, setLessonFocus] = useState<string>();
  const months = useMemo(() => monthsIn(data.classified), [data.classified]);
  const [month, setMonth] = useState<string>("");
  useEffect(() => {
    if (!months.includes(month)) setMonth(months[0] ?? new Date().toISOString().slice(0, 7));
  }, [months, month]);

  const summary = useMemo(() => summarize(data.classified, month), [data.classified, month]);
  const history = useMemo(() => trend(data.classified, 6), [data.classified]);
  const tips = useMemo(() => savingTips(data.classified, summary, data.budgets), [data.classified, summary, data.budgets]);
  const recurring = useMemo(() => findRecurring(data.classified, month), [data.classified, month]);
  const score = useMemo(() => moneyScore(data.classified, summary, data.budgets, data.lessonsDone.length), [data.classified, summary, data.budgets, data.lessonsDone]);

  const statuses = useMemo(() => limitStatuses(summary, data.budgets, data.alertAt), [summary, data.budgets, data.alertAt, data.categories]);

  // Alerts are about *this* month, whatever month is on screen.
  const thisMonth = new Date().toISOString().slice(0, 7);
  const current = useMemo(
    () => limitStatuses(summarize(data.classified, thisMonth), data.budgets, data.alertAt),
    [data.classified, data.budgets, data.alertAt, thisMonth, data.categories],
  );
  const toast = useLimitAlerts(current);

  const nw = useMemo(() => netWorth(data.accounts, data.classified, month), [data.accounts, data.classified, month]);
  const [txFilter, setTxFilter] = useState<TxFilter>({});
  const [anchor, setAnchor] = useState<string>();

  /** `t` may carry a section to scroll to, e.g. "accounts#debts". */
  const goTo = (t: string, lesson?: string) => {
    const [tabId, hash] = t.split("#");
    setTab(tabId as Tab);
    setLessonFocus(lesson);
    setAnchor(hash);
    if (tabId === "transactions") setTxFilter({});
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tab, anchor]);

  const accountsWithTx = useMemo(() => new Set(data.classified.map((t) => t.accountId)), [data.classified]);
  const nav: Nav = {
    tab: goTo,
    transactions: (filter) => {
      setTxFilter(filter);
      setTab("transactions");
      window.scrollTo({ top: 0 });
    },
    // Accounts with purchases open their history; balance-only accounts (e.g. a loan) open their settings.
    account: (a: Account) => (accountsWithTx.has(a.id) ? nav.transactions({ accountId: a.id }) : goTo(`accounts#acct-${a.id}`)),
  };

  const empty = !data.classified.length;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>◆</span> {APP_NAME}
        </div>
        {!empty && (
          <select className="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        )}
      </header>
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => goTo(t.id)}>
            <span aria-hidden>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>
      <main>
        {data.hasDemo && (
          <p className="banner">You're looking at demo data. <button className="link" onClick={() => goTo("accounts")}>Connect your own accounts →</button></p>
        )}
        {empty && tab !== "accounts" && tab !== "learn" && tab !== "categories" ? (
          <Welcome onDemo={data.loadDemo} onConnect={() => goTo("accounts")} />
        ) : tab === "overview" ? (
          <Overview data={data} summary={summary} history={history} score={score} tips={tips} statuses={month === thisMonth ? statuses : []} nw={nw} nav={nav} />
        ) : tab === "transactions" ? (
          <Transactions key={JSON.stringify(txFilter)} data={data} month={month} filter={txFilter} />
        ) : tab === "insights" ? (
          <Insights summary={summary} tips={tips} recurring={recurring} score={score} goTo={goTo} />
        ) : tab === "categories" ? (
          <Categories data={data} summary={summary} history={history} statuses={statuses} />
        ) : tab === "learn" ? (
          <Learn data={data} focus={lessonFocus} />
        ) : (
          <Accounts data={data} />
        )}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Welcome({ onDemo, onConnect }: { onDemo: () => void; onConnect: () => void }) {
  return (
    <section className="card welcome">
      <h1>Know where every dollar goes.</h1>
      <p>
        Connect your bank and cards once. {APP_NAME} brings in every purchase by itself, sorts it into your categories, warns you before you
        hit a limit, and shows your <strong>real</strong> spending: credit card payments aren't counted twice, only interest is.
      </p>
      <div className="row">
        <button className="btn" onClick={onConnect}>Connect my bank</button>
        <button className="btn secondary" onClick={onDemo}>Try with demo data</button>
      </div>
    </section>
  );
}

/** Pop up (and send a device notification, if allowed) when a new purchase pushes a category near or over its limit. */
function useLimitAlerts(current: LimitStatus[]): string | null {
  const prev = useRef<LimitStatus[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = current;
    if (!before) return; // first load: the Overview already shows where you stand
    const crossed = newlyCrossed(before, current);
    if (!crossed.length) return;
    const msg = crossed
      .map((s) => {
        const c = categoryInfo(s.id);
        return s.state === "over"
          ? `⛔ ${c.label} is over its ${usd(s.limit ?? 0)} limit by ${usd(s.spent - (s.limit ?? 0))}.`
          : `⚠️ ${c.label}: ${Math.round(s.used * 100)}% of the limit used, ${usd(s.left)} left.`;
      })
      .join(" ");
    setToast(msg);
    try {
      if ("Notification" in window && Notification.permission === "granted") new Notification(APP_NAME, { body: msg });
    } catch {
      /* notifications unavailable */
    }
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [current]);
  return toast;
}
