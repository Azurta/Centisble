import { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "./brand";
import { Accounts } from "./components/Accounts";
import { AuthGate } from "./components/Auth";
import { LegalPage, legalDocFor } from "./components/Legal";
import { showLocalNotification } from "./pwa";
import { useApplyAppearance } from "./appearance";
import { Settings } from "./components/Settings";
import type { Me } from "./api";
import { Bills } from "./components/Bills";
import { Categories } from "./components/Categories";
import { Goals } from "./components/Goals";
import { Insights } from "./components/Insights";
import { findSubscriptions } from "./lib/subscriptions";
import { goalPoints } from "./lib/goals";
import { MilestonesHub } from "./components/Goals";
import { Learn } from "./components/Learn";
import { DebtWidget, Overview } from "./components/Overview";
import { Earn } from "./components/Earn";
import { Feedback } from "./components/Feedback";
import { DebtList } from "./components/Accounts";
import { BottomNav, MAIN_TABS, SpendingHeader } from "./components/Nav";
import { Transactions, type TxFilter } from "./components/Transactions";
import { ReceiptScanner } from "./components/Receipts";
import { monthLabel } from "./format";
import { monthsIn, moneyScore, savingTips, summarize, summarizeMonths, trend, ytdMonths } from "./lib/analytics";
import { loadJson, saveJson } from "./lib/storage";
import { categoryInfo } from "./lib/categories";
import { limitStatuses, newlyCrossed, type LimitStatus } from "./lib/limits";
import { isDebt, netWorth } from "./lib/networth";
import type { Account } from "./lib/types";
import type { Nav } from "./components/Overview";
import { usd } from "./format";
import { STATIC, useAppData } from "./useAppData";

const TABS = [
  { id: "overview", label: "Home" },
  { id: "insights", label: "Spending" },
  { id: "categories", label: "Budgets" },
  { id: "earn", label: "Earn" },
  { id: "debt", label: "Debt" },
  { id: "transactions", label: "Transactions" },
  { id: "bills", label: "Bills" },
  { id: "learn", label: "Learn" },
  { id: "accounts", label: "Accounts" },
  { id: "settings", label: "Settings" },
  { id: "feedback", label: "Send feedback" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function App() {
  const legal = legalDocFor(window.location.pathname);
  if (legal) return <LegalPage doc={legal} />;
  return <AuthGate>{(me) => <Main me={me} />}</AuthGate>;
}

type Period = "month" | "ytd";

function Main({ me }: { me: Me | null }) {
  const data = useAppData();
  useApplyAppearance(data.appearance);
  // Coming back from a bank's own login page: reopen Accounts so the connection can finish.
  const [menu, setMenu] = useState(false);
  // Remembers whether this tester already sent feedback, to stop showing the invite banner.
  const [askedFeedback, setAskedFeedback] = useState(() => { try { return Boolean(localStorage.getItem("avryo.feedbackSent")); } catch { return false; } });
  const [lastTab, setLastTab] = useState("overview");
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).has("oauth_state_id") ? "accounts" : "overview"));
  const [lessonFocus, setLessonFocus] = useState<string>();
  const months = useMemo(() => monthsIn(data.classified), [data.classified]);
  const [month, setMonth] = useState<string>("");
  useEffect(() => {
    if (!months.includes(month)) setMonth(months[0] ?? new Date().toISOString().slice(0, 7));
  }, [months, month]);

  const summary = useMemo(() => summarize(data.classified, month), [data.classified, month]);

  /* "This month" vs "Year to date": what the home screen, transactions and charts add up. Remembered per device. */
  const [period, setPeriodState] = useState<Period>(() => loadJson<Period>("centsible.period", "month"));
  const setPeriod = (p: Period) => {
    setPeriodState(p);
    saveJson("centsible.period", p);
  };
  const periodMonths = useMemo(() => (period === "ytd" ? ytdMonths(month || new Date().toISOString().slice(0, 7)) : [month]), [period, month]);
  const periodSummary = useMemo(
    () => (period === "ytd" ? summarizeMonths(data.classified, periodMonths) : summary),
    [period, periodMonths, data.classified, summary],
  );
  // What to compare against: last month, or the same stretch of last year.
  const previousSummary = useMemo(() => {
    if (!month) return undefined;
    const [y, m] = month.split("-").map(Number);
    if (period === "ytd") return summarizeMonths(data.classified, periodMonths.map((pm) => `${y - 1}${pm.slice(4)}`));
    const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    return summarize(data.classified, prev);
  }, [period, periodMonths, month, data.classified]);
  const ytdSummary = useMemo(
    () => (month ? summarizeMonths(data.classified, ytdMonths(month)) : undefined),
    [data.classified, month],
  );
  const periodLabel = period === "ytd" ? `${month.slice(0, 4)} so far` : monthLabel(month).split(" ")[0];
  const history = useMemo(() => trend(data.classified, 6), [data.classified]);
  const tips = useMemo(() => savingTips(data.classified, summary, data.budgets), [data.classified, summary, data.budgets]);
  const subscriptions = useMemo(() => findSubscriptions(data.classified, month), [data.classified, month]);
  const score = useMemo(() => moneyScore(data.classified, summary, data.budgets, data.lessonsDone.length, goalPoints(data.goals)), [data.classified, summary, data.budgets, data.lessonsDone, data.goals]);

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
    if (tabId === "feedback") setLastTab(tab);
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
            {/* Avryo mark: the A as a peak with two money-green bars rising under it. Source art: public/icon.svg */}
            <svg className="logo" viewBox="14 14 72 72" width="24" height="24" aria-hidden>
              <path d="M22 78 L50 24 L78 78" fill="none" stroke="currentColor" strokeWidth="12" strokeLinejoin="round" strokeLinecap="butt" />
              <rect x="41.5" y="64" width="7" height="14" rx="2.5" fill="#4FD68A" />
              <rect x="51.5" y="56" width="7" height="22" rx="2.5" fill="#4FD68A" />
            </svg>
            {APP_NAME}
          </div>
          <div className="topbar-right">
            {!empty && (
              <div className="period" role="group" aria-label="Time period">
                <button className={period === "month" ? "on" : ""} aria-pressed={period === "month"} onClick={() => setPeriod("month")}>Month</button>
                <button className={period === "ytd" ? "on" : ""} aria-pressed={period === "ytd"} onClick={() => setPeriod("ytd")}>Year</button>
              </div>
            )}
            {!empty && (
              <select className="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            )}
            {me?.user && (
              <button className="avatar" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label={`Signed in as ${me.user.name}. Open menu`} title={me.user.email}>
                {me.user.name.slice(0, 1).toUpperCase()}
              </button>
            )}
            {menu && (
              <div className="more-menu" role="menu">
                {TABS.slice(MAIN_TABS).map((t) => (
                  <button key={t.id} role="menuitem" className={tab === t.id ? "on" : ""} onClick={() => { setMenu(false); goTo(t.id); }}>{t.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t, i) => (
            <button key={t.id} className={`${tab === t.id ? "active" : ""} ${i >= MAIN_TABS ? "more-tab" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => goTo(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="app">
      <main>
        {!STATIC && !askedFeedback && tab !== "feedback" && me?.user?.role !== "owner" && (
          <p className="banner">You're testing {APP_NAME} early. <button className="link" onClick={() => goTo("feedback")}>Tell us what you think →</button></p>
        )}
        {data.hasDemo && (
          <p className="banner">You're looking at demo data. <button className="link" onClick={() => goTo("accounts")}>Connect your own accounts →</button></p>
        )}
        {empty && !["accounts", "learn", "categories", "settings", "bills", "insights", "earn", "debt", "feedback"].includes(tab) ? (
          <div className="stack">
            <Welcome onDemo={data.loadDemo} onConnect={() => goTo("accounts")} onCash={() => goTo("accounts")} />
            <ReceiptScanner data={data} />
            {!STATIC && <MilestonesHub meId={me?.user?.id} />}
          </div>
        ) : tab === "overview" ? (
          <Overview data={data} meId={me?.user?.id} summary={periodSummary} ytd={ytdSummary} previous={previousSummary} periodLabel={periodLabel} period={period} history={history} score={score} tips={tips} statuses={month === thisMonth ? statuses : []} nw={nw} nav={nav} />
        ) : tab === "transactions" ? (
          <Transactions key={JSON.stringify(txFilter)} data={data} months={periodMonths} periodLabel={periodLabel} filter={txFilter} />
        ) : tab === "insights" ? (
          <div className="stack">
            <SpendingHeader summary={periodSummary} periodLabel={periodLabel} nav={nav} />
            <Insights summary={summary} tips={tips} subscriptions={subscriptions} score={score} goTo={goTo} />
          </div>
        ) : tab === "categories" ? (
          <div className="stack">
            <Categories data={data} summary={summary} history={history} statuses={statuses} />
            <Goals data={data} />
          </div>
        ) : tab === "earn" ? (
          <Earn data={data} month={month} nav={nav} />
        ) : tab === "debt" ? (
          <div className="stack">
            {nw.debts.length ? <DebtWidget nw={nw} nav={nav} /> : null}
            <DebtList data={data} />
          </div>
        ) : tab === "bills" ? (
          <Bills data={data} month={month} />
        ) : tab === "learn" ? (
          <Learn data={data} focus={lessonFocus} />
        ) : tab === "feedback" ? (
          <Feedback tab={lastTab} onSent={() => setAskedFeedback(true)} />
        ) : tab === "settings" ? (
          <Settings me={me} data={data} />
        ) : (
          <Accounts key={anchor} data={data} focus={anchor} />
        )}
      </main>
      </div>
      <BottomNav tab={tab} onGo={goTo} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Welcome({ onDemo, onConnect, onCash }: { onDemo: () => void; onConnect: () => void; onCash: () => void }) {
  const scan = () => (document.getElementById("receipt") ?? document.getElementById("add-purchase"))?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <section className="card welcome onboard">
      <h1>How do you want to track your money?</h1>
      <p className="muted">You can change this anytime. Every option is free. {APP_NAME} shows where you can save, what's safe to spend, and what your debt really costs.</p>
      <div className="onboard-options">
        <button className="onboard-option rec" onClick={onConnect}>
          <span className="onboard-icon" aria-hidden>🏦</span>
          <span><strong>Connect my bank</strong> <span className="badge-good">Recommended</span><br /><span className="muted small">Purchases show up on their own. Read-only and encrypted; we never see your bank password.</span></span>
        </button>
        <button className="onboard-option" onClick={scan}>
          <span className="onboard-icon" aria-hidden>📷</span>
          <span><strong>Snap receipts</strong><br /><span className="muted small">Take a photo and {APP_NAME} fills in the store, total and category. 30 free scans a month.</span></span>
        </button>
        <button className="onboard-option" onClick={onCash}>
          <span className="onboard-icon" aria-hidden>💵</span>
          <span><strong>Track cash</strong><br /><span className="muted small">Start with what's in your wallet and spend it down.</span></span>
        </button>
      </div>
      <button className="link small" onClick={onDemo}>Just looking? Try it with demo data →</button>
      <p className="muted small">No ads. We never sell your data.</p>
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
