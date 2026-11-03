import type { ReactNode } from "react";
import { usd } from "../format";
import type { MonthSummary } from "../lib/analytics";
import { Donut, toSlices } from "./Donut";
import type { Nav } from "./Overview";

/** The first five tabs are the main ones (bottom bar on phones); the rest live in the avatar menu. */
export const MAIN_TABS = 5;

const ICONS: Record<string, ReactNode> = {
  overview: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  insights: <path d="M4 6h16M4 12h16M4 18h10" />,
  categories: <><circle cx="12" cy="12" r="8" /><path d="M12 4v8l6 4" /></>,
  earn: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  debt: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></>,
};
const LABELS: [string, string][] = [["overview", "Home"], ["insights", "Spending"], ["categories", "Budgets"], ["earn", "Earn"], ["debt", "Debt"]];

/** Phone-style tab bar, shown on small screens only. */
export function BottomNav({ tab, onGo }: { tab: string; onGo: (t: string) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {LABELS.map(([id, label]) => (
        <button key={id} className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => onGo(id)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[id]}</svg>
          {label}
        </button>
      ))}
    </nav>
  );
}

/** Top of the Spending tab: the pie chart and a way into every purchase. */
export function SpendingHeader({ summary: s, periodLabel, nav }: { summary: MonthSummary; periodLabel: string; nav: Nav }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Where your money went <span className="period-tag">{periodLabel}</span></h2>
        <button className="link" onClick={() => nav.transactions({ view: "spending" })}>All purchases →</button>
      </div>
      <Donut
        slices={toSlices(s.byCategory)}
        centerLabel="Spent"
        centerValue={usd(s.spending)}
        onSelect={(ids) => nav.transactions(ids.length === 1 ? { category: ids[0] } : { categories: ids, view: "spending" })}
      />
    </section>
  );
}
