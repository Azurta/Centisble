import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePalette } from "../colors";
import { pct, shortMonth, usd } from "../format";
import type { MoneyScore, MonthSummary, Tip } from "../lib/analytics";
import { Donut, toSlices } from "./Donut";
import { ScoreRing } from "./Score";

interface Props {
  summary: MonthSummary;
  history: MonthSummary[];
  score: MoneyScore;
  tips: Tip[];
  goTo: (tab: string) => void;
}

export function Overview({ summary: s, history, score, tips, goTo }: Props) {
  const pal = usePalette();
  const doubleCounted = s.naiveOutflow - s.spending - s.saved;
  return (
    <div className="grid">
      <section className="stats">
        <Stat label="Income" value={usd(s.income)} />
        <Stat label="Real spending" value={usd(s.spending)} hint="Purchases + interest − refunds" />
        <Stat
          label="Left over"
          value={usd(s.income - s.spending)}
          tone={s.income - s.spending < 0 ? "bad" : "good"}
          hint={s.income ? `${pct(Math.max(0, s.savingsRate))} of income kept${s.saved > 0 ? ` (${usd(s.saved)} moved to savings)` : ""}` : undefined}
        />
        <Stat label="Interest & fees" value={usd(s.interestPaid, true)} tone={s.interestPaid > 0 ? "bad" : "good"} hint={s.interestPaid > 0 ? "Money lost to the bank" : "Nice — none"} />
      </section>

      {doubleCounted > 1 && (
        <section className="card accent">
          <h2>Why your spreadsheet says you're in the negative</h2>
          <p>
            Adding up every withdrawal this month gives <strong>{usd(s.naiveOutflow)}</strong>. But{" "}
            <strong>{usd(s.transfersExcluded)}</strong> of that was credit card payments and moves between your own accounts —
            paying for purchases that were <em>already</em> counted when you swiped the card
            {s.saved > 0 && <> — and {usd(s.saved)} went into savings</>}. Your real spending was{" "}
            <strong>{usd(s.spending)}</strong>.
          </p>
          <div className="compare">
            <div>
              <span className="muted small">Sheet-style total</span>
              <span className="strike">{usd(s.naiveOutflow)}</span>
            </div>
            <span aria-hidden>→</span>
            <div>
              <span className="muted small">Actual spending</span>
              <strong>{usd(s.spending)}</strong>
            </div>
          </div>
          {s.interestPaid > 0 && (
            <p className="small">
              ⚠️ The only time a card makes things cost more is interest: you paid <strong>{usd(s.interestPaid, true)}</strong> this month, and it's included in your spending.
            </p>
          )}
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Where your money went</h2>
          <button className="link" onClick={() => goTo("transactions")}>See all →</button>
        </div>
        <Donut slices={toSlices(s.byCategory)} centerLabel="Spent" centerValue={usd(s.spending)} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Money Score</h2>
          <button className="link" onClick={() => goTo("insights")}>Details →</button>
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

      {history.length > 1 && (
        <section className="card wide">
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
                <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="Income" fill={pal.series[0]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                <Bar dataKey="Spending" fill={pal.series[1]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <strong className={tone}>{value}</strong>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}
