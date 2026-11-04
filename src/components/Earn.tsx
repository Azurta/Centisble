import { useMemo } from "react";
import { usd } from "../format";
import { merchantKey } from "../lib/classify";
import { nextPayday } from "../lib/safeToSpend";
import { stoppedSubscriptions } from "../lib/subscriptions";
import { tidyName } from "../lib/bills";
import type { AppData } from "../useAppData";
import type { Nav } from "./Overview";

/** An example savings rate for the estimate. Rates change; the page says so. */
const EXAMPLE_APY = 0.04;

/** Earn: money coming in, money you may be owed, and ways to make more. Every link is free and official; no paid placements. */
export function Earn({ data, month, nav }: { data: AppData; month: string; nav: Nav }) {
  const income = useMemo(() => {
    const groups = new Map<string, { label: string; total: number; count: number }>();
    for (const t of data.classified) {
      if (t.kind !== "income" || !t.date.startsWith(month)) continue;
      const k = merchantKey(t);
      const g = groups.get(k) ?? { label: tidyName(t.merchant || t.description), total: 0, count: 0 };
      g.total -= t.amount;
      g.count++;
      groups.set(k, g);
    }
    return [...groups.values()].sort((a, b) => b.total - a.total);
  }, [data.classified, month]);
  const total = income.reduce((s, g) => s + g.total, 0);
  const paycheck = nextPayday(data.classified, new Date().toISOString().slice(0, 10)) ? income[0] : undefined;
  const side = income.filter((g) => g !== paycheck);

  const stopped = useMemo(() => stoppedSubscriptions(data.classified), [data.classified]);
  const found = stopped.reduce((s, x) => s + x.yearly, 0);

  const savings = data.accounts.filter((a) => a.type === "savings" && !a.hidden).reduce((s, a) => s + (a.balance ?? 0), 0);
  const savingsInterest = data.classified.filter((t) => t.kind === "income" && t.date.startsWith(month) && /interest/i.test(t.description)).reduce((s, t) => s - t.amount, 0);
  const couldEarn = (savings * EXAMPLE_APY) / 12;

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-row">
          <span className="hero-label">Money in this month</span>
          {found > 0 && <button className="hero-chip" onClick={() => document.getElementById("found")?.scrollIntoView({ behavior: "smooth" })}>
            Found {usd(found)} ›
          </button>}
        </div>
        <div className="hero-num">{usd(total)}</div>
        {income.length ? (
          <ul className="hero-list">
            {income.slice(0, 4).map((g) => (
              <li key={g.label}><span>{g.label}{g.count > 1 ? ` · ${g.count} deposits` : ""}</span><strong>{usd(g.total, true)}</strong></li>
            ))}
          </ul>
        ) : (
          <p className="hero-sub">No money in yet this month. Paychecks, tips and transfers in show up here.</p>
        )}
      </section>

      <section className="card" id="found">
        <div className="card-head"><h2>Avyro found you</h2><strong className="good big">{usd(found)}<span className="small muted">/yr</span></strong></div>
        {stopped.length ? (
          <ul className="list">
            {stopped.map((s) => (
              <li key={s.key}><span>Stopped {tidyName(s.label)} <span className="muted small">last charged {s.lastDate.slice(5).replace("-", "/")}</span></span><span className="good">+{usd(s.yearly, true)}/yr</span></li>
            ))}
          </ul>
        ) : (
          <p className="muted small">When you cancel a subscription, it's counted here at its yearly cost. Check the Spending tab for price increases and cancel links.</p>
        )}
        <button className="link small" onClick={() => nav.tab("insights")}>See your subscriptions →</button>
      </section>

      <h2 className="section-title">Money you may be owed</h2>
      <div className="earn-grid">
        <EarnCard title="Search unclaimed money" body="Old deposits, refunds and final paychecks that states are holding. Free official search." href="https://www.missingmoney.com/" cta="Search" />
        <EarnCard title="Earned Income Tax Credit check" body="Working people with low to moderate income can get thousands back at tax time. The IRS tool takes a few minutes." href="https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/use-the-eitc-assistant" cta="Check" />
        <EarnCard title="Benefits you might get" body="Help with internet, energy, food and health costs. The official government finder." href="https://www.usa.gov/benefits" cta="Check" />
      </div>

      <h2 className="section-title">Make more</h2>
      <div className="earn-grid">
        <EarnCard
          title="High-yield savings"
          body={
            savings > 0
              ? `Your savings earned ${usd(savingsInterest, true)} this month. At a ${(EXAMPLE_APY * 100).toFixed(0)}% APY, ${usd(savings)} would earn about ${usd(couldEarn, true)} a month. Compare FDIC-insured accounts.`
              : "A high-yield savings account pays many times what a regular one does. Compare FDIC-insured accounts before you switch."
          }
          value={savings > 0 && couldEarn > savingsInterest ? `+${usd(couldEarn - savingsInterest, true)}/mo` : undefined}
          href="https://www.fdic.gov/resources/deposit-insurance/financial-institutions"
          cta="How to check a bank"
        />
        <EarnCard title="Check your pay" body="See what your job pays in your area, from the U.S. Department of Labor." href="https://www.careeronestop.org/Toolkit/Wages/find-salary.aspx" cta="Compare" />
        <div className="card earn-card">
          <strong>Side income</strong>
          <span className="muted small">
            {side.length ? `${side.map((g) => g.label).join(", ")}: ${usd(side.reduce((s, g) => s + g.total, 0), true)} this month.` : "Tips, gigs and things you sell. Log cash tips in Accounts → Cash."}
          </span>
          <button className="link small" onClick={() => nav.tab("accounts")}>Log income →</button>
        </div>
      </div>
      <p className="muted small">Estimates use your own accounts, and rates change. Avyro has no paid links here and never promotes loans or credit cards.</p>
    </div>
  );
}

function EarnCard({ title, body, href, cta, value }: { title: string; body: string; href: string; cta: string; value?: string }) {
  return (
    <a className="card earn-card" href={href} target="_blank" rel="noreferrer">
      <span className="earn-top"><strong>{title}</strong>{value && <span className="good strong">{value}</span>}</span>
      <span className="muted small">{body}</span>
      <span className="small link-like">{cta} ↗</span>
    </a>
  );
}
