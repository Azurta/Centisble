import { useEffect, useMemo, useState } from "react";
import { Accounts } from "./components/Accounts";
import { Budgets } from "./components/Budgets";
import { Insights } from "./components/Insights";
import { Learn } from "./components/Learn";
import { Overview } from "./components/Overview";
import { Transactions } from "./components/Transactions";
import { monthLabel } from "./format";
import { findRecurring, monthsIn, moneyScore, savingTips, summarize, trend } from "./lib/analytics";
import { useAppData } from "./useAppData";

const TABS = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "transactions", label: "Transactions", icon: "🧾" },
  { id: "insights", label: "Save", icon: "💡" },
  { id: "budgets", label: "Budgets", icon: "🎯" },
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

  const goTo = (t: string, lesson?: string) => {
    setTab(t as Tab);
    setLessonFocus(lesson);
    window.scrollTo({ top: 0 });
  };

  const empty = !data.classified.length;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>◆</span> Azurta
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
        {empty && tab !== "accounts" && tab !== "learn" ? (
          <Welcome onDemo={data.loadDemo} onConnect={() => goTo("accounts")} />
        ) : tab === "overview" ? (
          <Overview summary={summary} history={history} score={score} tips={tips} goTo={goTo} />
        ) : tab === "transactions" ? (
          <Transactions data={data} month={month} />
        ) : tab === "insights" ? (
          <Insights summary={summary} tips={tips} recurring={recurring} score={score} goTo={goTo} />
        ) : tab === "budgets" ? (
          <Budgets data={data} summary={summary} history={history} />
        ) : tab === "learn" ? (
          <Learn data={data} focus={lessonFocus} />
        ) : (
          <Accounts data={data} />
        )}
      </main>
    </div>
  );
}

function Welcome({ onDemo, onConnect }: { onDemo: () => void; onConnect: () => void }) {
  return (
    <section className="card welcome">
      <h1>Know where every dollar goes.</h1>
      <p>
        Azurta pulls in your purchases automatically, sorts them into categories, and shows your <strong>real</strong> spending — credit card
        payments aren't counted twice, only interest is.
      </p>
      <div className="row">
        <button className="btn" onClick={onConnect}>Connect accounts or import a sheet</button>
        <button className="btn secondary" onClick={onDemo}>Try with demo data</button>
      </div>
    </section>
  );
}
