import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePalette } from "../colors";
import { pct, shortMonth, usd } from "../format";
import type { MoneyScore, MonthSummary, Tip } from "../lib/analytics";
import { categoryInfo } from "../lib/categories";
import type { LimitStatus } from "../lib/limits";
import type { NetWorth } from "../lib/networth";
import type { Account } from "../lib/types";
import { STATIC, type AppData } from "../useAppData";
import { Donut, toSlices } from "./Donut";
import { ScoreRing } from "./Score";
import { Sortable } from "./Sortable";
import { Goals } from "./Goals";
import { shortDay, statusLine } from "./Bills";
import { billsForMonth, billTotals } from "../lib/bills";
import type { TxFilter } from "./Transactions";

/* ------------------------------------------------------------------ */
/* Home screen widgets — order and visibility are yours to change      */
/* ------------------------------------------------------------------ */

export const WIDGETS = [
  { id: "spending", label: "Where your money went (pie chart)", size: "half" },
  { id: "snapshot", label: "Income, expenses, what you own & owe", size: "half" },
  { id: "limits", label: "Limits this month", size: "wide" },
  { id: "bills", label: "Upcoming bills", size: "half" },
  { id: "goals", label: "Savings goals", size: "half" },
  { id: "accounts", label: "Accounts & net worth", size: "half" },
  { id: "debt", label: "Debt & interest", size: "half" },
  { id: "score", label: "Money Score & top tips", size: "half" },
  { id: "real", label: "Real spending explained", size: "half" },
  { id: "trend", label: "Income vs. spending by month", size: "wide" },
] as const;
export type WidgetId = (typeof WIDGETS)[number]["id"];
export interface HomeWidget {
  id: WidgetId;
  hidden?: boolean;
}

/** Your saved layout, plus any widgets added in a newer version (placed after their neighbour in the default order). */
export function resolveLayout(saved: HomeWidget[]): HomeWidget[] {
  const known = new Set<string>(WIDGETS.map((w) => w.id));
  const out = saved.filter((w) => known.has(w.id));
  WIDGETS.forEach((w, i) => {
    if (out.some((k) => k.id === w.id)) return;
    const prev = i > 0 ? out.findIndex((k) => k.id === WIDGETS[i - 1].id) : -1;
    out.splice(prev + 1, 0, { id: w.id });
  });
  return out;
}

export interface Nav {
  tab: (tab: string, lesson?: string) => void;
  transactions: (filter: TxFilter) => void;
  account: (a: Account) => void;
}

interface Props {
  data: AppData;
  /** Totals for the chosen period (a month, or the year so far). */
  summary: MonthSummary;
  /** January through the selected month, shown as a quick "year so far" line. */
  ytd?: MonthSummary;
  /** The period to compare against (last month, or the same months last year). */
  previous?: MonthSummary;
  period: "month" | "ytd";
  /** e.g. "September" or "2026 so far". */
  periodLabel: string;
  history: MonthSummary[];
  score: MoneyScore;
  tips: Tip[];
  /** Limit status for the current month (empty when looking at a past month). */
  statuses: LimitStatus[];
  nw: NetWorth;
  nav: Nav;
}

export function Overview(props: Props) {
  const { data } = props;
  const [customizing, setCustomizing] = useState(false);
  const layout = resolveLayout(data.homeLayout);

  const render: Record<WidgetId, () => ReactNode> = {
    spending: () => <SpendingWidget {...props} />,
    snapshot: () => <SnapshotWidget {...props} />,
    limits: () => <LimitAlerts statuses={props.statuses} nav={props.nav} />,
    bills: () => <BillsWidget {...props} />,
    goals: () => <Goals data={data} compact />,
    accounts: () => <AccountsWidget {...props} />,
    debt: () => <DebtWidget {...props} />,
    score: () => <ScoreWidget {...props} />,
    real: () => <RealSpendingWidget {...props} />,
    trend: () => <TrendWidget {...props} />,
  };

  return (
    <div className="stack">
      <div className="home-bar">
        <button className="link small" onClick={() => setCustomizing((c) => !c)} aria-expanded={customizing}>
          {customizing ? "Done" : "Customize"}
        </button>
      </div>
      {customizing && <Customize layout={layout} onChange={data.setHomeLayout} />}
      <div className="grid">
        {layout.filter((w) => !w.hidden).map((w) => {
          const content = render[w.id]();
          if (!content) return null;
          const size = WIDGETS.find((x) => x.id === w.id)!.size;
          return <div key={w.id} className={`widget ${size}`}>{content}</div>;
        })}
      </div>
    </div>
  );
}

function Customize({ layout, onChange }: { layout: HomeWidget[]; onChange: (l: HomeWidget[]) => void }) {
  const def = (w: HomeWidget) => WIDGETS.find((x) => x.id === w.id)!;
  return (
    <section className="card customize-panel">
      <h2>Customize your home screen</h2>
      <p className="muted small">Drag sections by the handle to reorder them, and untick any you don't want. On a computer, half-width sections sit side by side.</p>
      <Sortable
        className="customize"
        items={layout}
        getId={(w) => w.id}
        label={(w) => def(w).label}
        onReorder={onChange}
        itemClassName={(w) => (w.hidden ? "off" : "")}
        render={(w, handle) => (
          <>
            {handle}
            <label className="check">
              <input
                type="checkbox"
                checked={!w.hidden}
                onChange={(e) => onChange(layout.map((x) => (x.id === w.id ? { ...x, hidden: !e.target.checked } : x)))}
              />
              {def(w).label}
            </label>
          </>
        )}
      />
      <button className="link small" onClick={() => onChange(WIDGETS.map((w) => ({ id: w.id })))}>Reset to default</button>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function SpendingWidget({ summary: s, nav, periodLabel }: Props) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Where your money went <span className="period-tag">{periodLabel}</span></h2>
        <button className="link" onClick={() => nav.transactions({ view: "spending" })}>See all →</button>
      </div>
      <Donut
        slices={toSlices(s.byCategory)}
        centerLabel="Spent"
        centerValue={usd(s.spending)}
        onSelect={(ids) => nav.transactions(ids.length === 1 ? { category: ids[0] } : { categories: ids, view: "spending" })}
      />
      <p className="muted small mt-s">Tap a category to see its purchases.</p>
    </section>
  );
}

/** "+12% vs Aug" style change; for spending, going up is bad. */
function Delta({ now, before, upIsGood, vs }: { now: number; before?: number; upIsGood: boolean; vs: string }) {
  if (before == null || before <= 0 || now < 0) return null;
  const change = (now - before) / before;
  if (Math.abs(change) < 0.005) return <span className="delta flat">Same as {vs}</span>;
  const good = change > 0 === upIsGood;
  return (
    <span className={`delta ${good ? "up-good" : "up-bad"}`}>
      <span aria-hidden>{change > 0 ? "▲" : "▼"}</span> {Math.abs(Math.round(change * 100))}% vs {vs}
    </span>
  );
}

function SnapshotWidget({ summary: s, previous, ytd, nw, nav, period, periodLabel }: Props) {
  const left = s.income - s.spending;
  const vs = period === "ytd" ? "last year" : "last month";
  const hasBalances = nw.assets.length + nw.debts.length > 0;
  return (
    <section className="card snapshot">
      <div className="tiles">
        <Tile
          label="Income"
          value={usd(s.income)}
          hint={periodLabel}
          extra={<Delta now={s.income} before={previous?.income} upIsGood vs={vs} />}
          onClick={() => nav.transactions({ view: "income" })}
        />
        <Tile
          label="Expenses"
          value={usd(s.spending)}
          hint={periodLabel}
          extra={<Delta now={s.spending} before={previous?.spending} upIsGood={false} vs={vs} />}
          onClick={() => nav.transactions({ view: "spending" })}
        />
        <Tile
          label="You own"
          value={hasBalances ? usd(nw.totalAssets) : "—"}
          hint={hasBalances ? `${nw.assets.length} account${nw.assets.length === 1 ? "" : "s"}` : "add balances"}
          tone="good"
          onClick={() => nav.tab("accounts#assets")}
        />
        <Tile
          label="You owe"
          value={hasBalances ? usd(nw.totalDebt) : "—"}
          hint={hasBalances ? `${nw.debts.length} debt${nw.debts.length === 1 ? "" : "s"}` : "add balances"}
          tone={nw.totalDebt > 0 ? "bad" : undefined}
          onClick={() => nav.tab("accounts#debts")}
        />
      </div>
      <dl className="snapshot-lines">
        <div>
          <dt>Left over ({periodLabel})</dt>
          <dd className={left < 0 ? "bad" : "good"}>
            {usd(left)} {s.income > 0 && <span className="muted small">({pct(Math.max(0, s.savingsRate))} kept)</span>}
          </dd>
        </div>
        {period === "month" && ytd && ytd.income + ytd.spending > 0 && (
          <div>
            <dt>{ytd.month.slice(0, 4)} so far</dt>
            <dd>
              {usd(ytd.income)} <span className="muted small">in</span> · {usd(ytd.spending)} <span className="muted small">spent</span>
            </dd>
          </div>
        )}
        {hasBalances && (
          <div>
            <dt>Net worth</dt>
            <dd className={nw.netWorth < 0 ? "bad" : "good"}>{usd(nw.netWorth)}</dd>
          </div>
        )}
        {s.interestPaid > 0 && (
          <div>
            <dt>Interest & fees paid</dt>
            <dd className="bad">
              <button className="link" onClick={() => nav.transactions({ view: "interest" })}>{usd(s.interestPaid, true)}</button>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function Tile({ label, value, hint, tone, extra, onClick }: { label: string; value: string; hint?: string; tone?: "good" | "bad"; extra?: ReactNode; onClick: () => void }) {
  return (
    <button className="tile" onClick={onClick}>
      <span className="muted small">{label}</span>
      <strong className={tone}>{value}</strong>
      {extra}
      {hint && <span className="muted small">{hint} ›</span>}
    </button>
  );
}

function AccountsWidget({ nw, nav }: Props) {
  if (!nw.assets.length && !nw.debts.length)
    return (
      <section className="card">
        <h2>Accounts & net worth</h2>
        <p className="muted small">Connect your bank to see every balance here, or add accounts and loans by hand.</p>
        <button className="btn secondary" onClick={() => nav.tab("accounts")}>Add accounts</button>
      </section>
    );
  return (
    <section className="card">
      <div className="card-head">
        <h2>Accounts</h2>
        <button className="link" onClick={() => nav.tab("accounts")}>Manage →</button>
      </div>
      <AccountGroup title="You own" total={nw.totalAssets} tone="good">
        {nw.assets.map((a) => <AccountLine key={a.id} a={a} onClick={() => nav.account(a)} />)}
      </AccountGroup>
      <AccountGroup title="You owe" total={nw.totalDebt} tone="bad">
        {nw.debts.map((d) => <AccountLine key={d.account.id} a={d.account} onClick={() => nav.account(d.account)} />)}
      </AccountGroup>
      <div className="nw-total">
        <span>Net worth</span>
        <strong className={nw.netWorth < 0 ? "bad" : "good"}>{usd(nw.netWorth)}</strong>
      </div>
      {nw.netWorth < 0 && (
        <p className="muted small">A negative net worth is normal with student or car loans. What matters is that it goes up every month.</p>
      )}
    </section>
  );
}

function AccountGroup({ title, total, tone, children }: { title: string; total: number; tone: "good" | "bad"; children: ReactNode }) {
  return (
    <div className="acct-group">
      <div className="acct-group-head">
        <span className="eyebrow">{title}</span>
        <span className={`small ${tone}`}>{usd(total)}</span>
      </div>
      <ul className="acct-list">{children}</ul>
    </div>
  );
}

const TYPE_SHORT: Record<string, string> = { checking: "Checking", savings: "Savings", cash: "Cash", credit: "Credit card", loan: "Loan" };

function AccountLine({ a, onClick }: { a: Account; onClick: () => void }) {
  return (
    <li>
      <button className="acct-line" onClick={onClick}>
        <span className="acct-name">{a.name}<span className="acct-type">{TYPE_SHORT[a.type]}</span></span>
        <span className="acct-bal">{usd(a.balance ?? 0, true)}</span>
      </button>
    </li>
  );
}

function DebtWidget({ nw, nav }: Props) {
  if (!nw.debts.length) return null;
  const missingApr = nw.debts.filter((d) => d.apr == null);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Debt & interest</h2>
        <button className="link" onClick={() => nav.tab("accounts#debts")}>Edit rates →</button>
      </div>
      <div className="debt-totals">
        <div>
          <span className="muted small">Total owed</span>
          <strong>{usd(nw.totalDebt)}</strong>
        </div>
        <div>
          <span className="muted small">Interest if unpaid</span>
          {missingApr.length === nw.debts.length ? (
            <>
              <strong className="muted">—</strong>
              <span className="muted small">add interest rates</span>
            </>
          ) : (
            <>
              <strong className="bad">{usd(nw.monthlyInterest)}/mo</strong>
              <span className="muted small">{usd(nw.monthlyInterest * 12)}/yr{missingApr.length ? `, ${missingApr.length} without a rate` : ""}</span>
            </>
          )}
        </div>
      </div>
      <div className="table-wrap">
        <table className="debt-table">
          <thead>
            <tr><th>Debt</th><th className="num">Owed</th><th className="num">Rate</th><th className="num">Interest/mo</th></tr>
          </thead>
          <tbody>
            {nw.debts.map((d) => (
              <tr key={d.account.id} onClick={() => nav.account(d.account)} className="clickable">
                <td>
                  {d.account.name}
                  {d.utilization != null && (
                    <div className={`small ${d.utilization > 0.3 ? "bad" : "muted"}`}>{pct(d.utilization)} of limit used</div>
                  )}
                  {d.chargedThisMonth > 0 && <div className="small bad">{usd(d.chargedThisMonth, true)} charged this month</div>}
                  {d.account.nextDue && (
                    <div className="small muted">
                      Due {shortDate(d.account.nextDue)}
                      {d.account.minPayment != null && <> · min {usd(d.account.minPayment, true)}</>}
                    </div>
                  )}
                </td>
                <td className="num">{usd(d.balance)}</td>
                <td className="num">{d.apr != null ? `${d.apr}%` : <span className="muted">add</span>}</td>
                <td className="num">
                  {d.monthlyInterest != null ? usd(d.monthlyInterest, true) : "—"}
                  <div className="small link-text">Pay off ›</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Credit cards only charge interest on a balance you carry past the due date. Pay the full statement balance and it's $0.
        {nw.debts.length > 1 && " Put extra money toward the highest rate first — it's at the top."}
        {missingApr.length > 0 && ` Add the rate for ${missingApr.length} debt${missingApr.length > 1 ? "s" : ""} to see what it costs.`}{" "}
        <button className="link small" onClick={() => nav.tab("learn", "debt-payoff")}>How to pay off debt →</button>
      </p>
    </section>
  );
}

const shortDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function ScoreWidget({ score, tips, nav }: Props) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Money Score</h2>
        <button className="link" onClick={() => nav.tab("insights")}>Details →</button>
      </div>
      <ScoreRing score={score} />
      <h3 className="mt">Biggest ways to save</h3>
      <ul className="tips compact">
        {tips.slice(0, 3).map((t) => (
          <li key={t.id} className={`tip ${t.severity}`}>
            <span>{t.title}</span>
            {t.monthly > 0 && <span className="save">+{usd(t.monthly)}/mo</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RealSpendingWidget({ summary: s, periodLabel }: Props) {
  if (s.naiveOutflow - s.spending - s.saved <= 1) return null;
  return (
    <section className="card">
      <h2>Your real spending <span className="period-tag">{periodLabel}</span></h2>
      <div className="compare">
        <div>
          <span className="muted small">Every withdrawal added up</span>
          <span className="strike">{usd(s.naiveOutflow)}</span>
        </div>
        <span aria-hidden>→</span>
        <div>
          <span className="muted small">Actual spending</span>
          <strong>{usd(s.spending)}</strong>
        </div>
      </div>
      <p className="small">
        <strong>{usd(s.transfersExcluded)}</strong> was credit card payments and moves between your own accounts. Those paid for purchases
        already counted when you swiped the card{s.saved > 0 && <>, and {usd(s.saved)} went into savings</>}.
        {s.interestPaid > 0 && <> Interest ({usd(s.interestPaid, true)}) is the only extra cost, and it's included.</>}
      </p>
    </section>
  );
}

function TrendWidget({ history }: Props) {
  const pal = usePalette();
  if (history.length < 2) return null;
  return (
    <section className="card">
      <h2>Income vs. real spending</h2>
      <div className="chart" role="img" aria-label="Income and spending by month">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={history.map((m) => ({ month: shortMonth(m.month), Income: Math.round(m.income), Spending: Math.round(m.spending) }))} barGap={2}>
            <CartesianGrid vertical={false} stroke={pal.grid} />
            <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: pal.axis }} tick={{ fill: pal.muted, fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: pal.muted, fontSize: 12 }} tickFormatter={(v) => usd(v)} width={60} />
            <Tooltip
              cursor={{ fill: pal.grid, opacity: 0.5 }}
              formatter={(v) => usd(Number(v))}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} formatter={(v) => <span style={{ color: "var(--text-2)" }}>{v}</span>} />
            <Bar dataKey="Income" fill={pal.series[0]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="Spending" fill={pal.series[1]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function LimitAlerts({ statuses, nav }: { statuses: LimitStatus[]; nav: Nav }) {
  const [perm, setPerm] = useState(() => ("Notification" in window ? Notification.permission : "denied"));
  if (!statuses.length) return null;
  const withLimit = statuses.filter((x) => x.state !== "none");
  const flagged = withLimit.filter((x) => x.state === "warn" || x.state === "over").sort((a, b) => b.used - a.used);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Limits this month</h2>
        <button className="link" onClick={() => nav.tab("categories")}>{withLimit.length ? "Edit limits →" : "Set limits →"}</button>
      </div>
      {!withLimit.length ? (
        <p className="muted small">Set a monthly limit on categories like Eating Out or Alcohol and you'll be warned before you go over.</p>
      ) : !flagged.length ? (
        <p className="small good">All {withLimit.length} limits on track.</p>
      ) : (
        <div className="alerts">
          {flagged.map((x) => {
            const c = categoryInfo(x.id);
            return (
              <button key={x.id} className={`alert ${x.state}`} onClick={() => nav.transactions({ category: x.id })}>
                <span>
                  <span className={`dot ${x.state === "over" ? "critical" : "warning"}`} aria-hidden /> <strong>{c.label}</strong>: {usd(x.spent)} of {usd(x.limit ?? 0)}
                </span>
                <span className="small nowrap">
                  {x.state === "over" ? <span className="bad">{usd(-x.left)} over</span> : <>{usd(x.perDay)}/day left</>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {!STATIC && perm === "default" && (
        <button className="link small mt-s" onClick={async () => setPerm(await Notification.requestPermission())}>
          Also alert me on this device when a purchase gets close to a limit
        </button>
      )}
    </section>
  );
}

function BillsWidget({ data, nav }: Props) {
  const month = new Date().toISOString().slice(0, 7);
  const occ = billsForMonth(data.bills, data.classified, month);
  const t = billTotals(occ);
  const open = occ.filter((o) => o.status !== "paid");
  return (
    <section className="card">
      <div className="card-head">
        <h2>Upcoming bills</h2>
        <button className="link" onClick={() => nav.tab("bills")}>{data.bills.length ? "All bills →" : "Add bills →"}</button>
      </div>
      {!data.bills.length ? (
        <p className="muted small">Add your monthly bills to see what's due and get a reminder before each one.</p>
      ) : !open.length ? (
        <p className="small good">All {occ.length} bills paid this month ({usd(t.paid)}).</p>
      ) : (
        <>
          <ul className="acct-list">
            {open.slice(0, 5).map((o) => (
              <li key={o.bill.id}>
                <button className="acct-line" onClick={() => nav.tab("bills")}>
                  <span className="acct-name">
                    {o.bill.name}
                    <span className={`acct-type ${o.status === "overdue" || o.status === "due-today" ? "bad" : ""}`}>{shortDay(o.date)} · {statusLine(o)}</span>
                  </span>
                  <span className="acct-bal">{usd(o.bill.amount, true)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small mt-s">{usd(t.left)} still to pay this month · {usd(t.paid)} paid</p>
        </>
      )}
    </section>
  );
}
