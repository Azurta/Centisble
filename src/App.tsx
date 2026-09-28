import { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "./brand";
import { Accounts } from "./components/Accounts";
import { AuthGate } from "./components/Auth";
import { showLocalNotification } from "./pwa";
import { Settings } from "./components/Settings";
import type { Me } from "./api";
import { Bills } from "./components/Bills";
import { Categories } from "./components/Categories";
import { Goals } from "./components/Goals";
import { Insights } from "./components/Insights";
import { Learn } from "./components/Learn";
import { Overview } from "./components/Overview";
import { Transactions, type TxFilter } from "./components/Transactions";
import { monthLabel } from "./format";
import { findRecurring, monthsIn, moneyScore, savingTips, summarize, trend } from "./lib/analytics";
import { categoryInfo } from "./lib/categories";
import { limitStatuses, newlyCrossed, type LimitStatus } from "./lib/limits";
import { isDebt, netWorth } from "./lib/networth";
import type { Account } from "./lib/types";
import type { Nav } from "./components/Overview";
import { usd } from "./format";
import { useAppData } from "./useAppData";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "transactions", label: "Transactions" },
  { id: "insights", label: "Savings" },
  { id: "categories", label: "Budgets" },
  { id: "bills", label: "Bills" },
  { id: "learn", label: "Learn" },
  { id: "accounts", label: "Accounts" },
  { id: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function App() {
  return <AuthGate>{(me) => <Main me={me} />}</AuthGate>;
}

function Main({ me }: { me: Me | null }) {
  const data = useAppData();
  // Coming back from a bank's own login page: reopen Accounts so the connection can finish.
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).has("oauth_state_id") ? "accounts" : "overview"));
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
    // Debts open their payoff plan; other accounts open their purchase history when they have one.
    account: (a: Account) =>
      !isDebt(a) && accountsWithTx.has(a.id) ? nav.transactions({ accountId: a.id }) : goTo(`accounts#acct-${a.id}`),
  };

  const empty = !data.classified.length;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <svg className="logo" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <rect x="2" y="12" width="4" height="10" rx="1" />
              <rect x="10" y="7" width="4" height="15" rx="1" />
              <rect x="18" y="2" width="4" height="20" rx="1" />
            </svg>
            {APP_NAME}
          </div>
          <div className="topbar-right">
            {!empty && (
              <select className="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            )}
            {me?.user && (
              <button className="avatar" onClick={() => goTo("settings")} aria-label={`Signed in as ${me.user.name}. Open settings`} title={me.user.email}>
                {me.user.name.slice(0, 1).toUpperCase()}
              </button>
            )}
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "active" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => goTo(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="app">
      <main>
        {data.hasDemo && (
          <p className="banner">You're looking at demo data. <button className="link" onClick={() => goTo("accounts")}>Connect your own accounts →</button></p>
        )}
        {empty && !["accounts", "learn", "categories", "settings", "bills", "insights"].includes(tab) ? (
          <Welcome onDemo={data.loadDemo} onConnect={() => goTo("accounts")} />
        ) : tab === "overview" ? (
          <Overview data={data} summary={summary} history={history} score={score} tips={tips} statuses={month === thisMonth ? statuses : []} nw={nw} nav={nav} />
        ) : tab === "transactions" ? (
          <Transactions key={JSON.stringify(txFilter)} data={data} month={month} filter={txFilter} />
        ) : tab === "insights" ? (
          <div className="stack">
            <Goals data={data} />
            <Insights summary={summary} tips={tips} recurring={recurring} score={score} goTo={goTo} />
          </div>
        ) : tab === "categories" ? (
          <Categories data={data} summary={summary} history={history} statuses={statuses} />
        ) : tab === "bills" ? (
          <Bills data={data} month={month} />
        ) : tab === "learn" ? (
          <Learn data={data} focus={lessonFocus} />
        ) : tab === "settings" ? (
          <Settings me={me} data={data} />
        ) : (
          <Accounts key={anchor} data={data} focus={anchor} />
        )}
      </main>
      </div>
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
          ? `${c.label} is over its ${usd(s.limit ?? 0)} limit by ${usd(s.spent - (s.limit ?? 0))}.`
          : `${c.label}: ${Math.round(s.used * 100)}% of the limit used, ${usd(s.left)} left.`;
      })
      .join(" ");
    setToast(msg);
    showLocalNotification(APP_NAME, msg);
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [current]);
  return toast;
}
