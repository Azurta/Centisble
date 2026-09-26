import { futureValue, type MoneyScore, type MonthSummary, type Recurring, type Tip } from "../lib/analytics";
import { categoryInfo } from "../lib/categories";
import { LESSONS } from "../lib/lessons";
import type { CategoryId } from "../lib/types";
import { pct, usd } from "../format";
import { usePalette } from "../colors";
import { Donut, toSlices } from "./Donut";
import { ScoreRing } from "./Score";

interface Props {
  summary: MonthSummary;
  tips: Tip[];
  recurring: Recurring[];
  score: MoneyScore;
  goTo: (tab: string, lesson?: string) => void;
}

export function Insights({ summary: s, tips, recurring, score, goTo }: Props) {
  const pal = usePalette();
  // Tips can overlap (e.g. "over budget" and "small purchases" in the same category) — take the largest per category.
  const potential: Partial<Record<CategoryId, number>> = {};
  for (const t of tips) if (t.category && t.monthly > 0) potential[t.category] = Math.max(potential[t.category] ?? 0, t.monthly);
  const monthlyPotential = Object.values(potential).reduce((a, b) => a + (b ?? 0), 0);

  const income = s.income || 1;
  const kept = Math.max(0, s.income - s.spending);
  const split = [
    { label: "Needs", actual: s.needs, target: 0.5, color: pal.series[0], hint: "Rent, debt, car, groceries, bills, health" },
    { label: "Wants", actual: s.wants, target: 0.3, color: pal.series[1], hint: "Going out, alcohol, shopping, subscriptions, travel, misc" },
    { label: "Saved / kept", actual: kept, target: 0.2, color: pal.series[2], hint: "Income not spent" },
  ];

  return (
    <div className="grid">
      <section className="card">
        <h2>Where you could save</h2>
        <p className="muted small">Estimated monthly savings by category if you follow the tips below.</p>
        <Donut slices={toSlices(potential)} centerLabel="Per month" centerValue={usd(monthlyPotential)} />
        {monthlyPotential > 0 && (
          <div className="callout">
            Saving <strong>{usd(monthlyPotential)}/mo</strong> is <strong>{usd(monthlyPotential * 12)}</strong> a year — invested at 7% that's about{" "}
            <strong>{usd(futureValue(monthlyPotential, 10))}</strong> in 10 years.
          </div>
        )}
      </section>

      <section className="card">
        <h2>50 / 30 / 20 check</h2>
        <p className="muted small">How your income was split vs. the recommended rule.</p>
        {s.income === 0 ? (
          <p className="muted empty">No income recorded this month yet.</p>
        ) : (
          <div className="split">
            {split.map((b) => {
              const share = b.actual / income;
              const ok = b.label === "Saved / kept" ? share >= b.target : share <= b.target;
              return (
                <div key={b.label} className="split-row">
                  <div className="split-head">
                    <strong>{b.label}</strong>
                    <span>
                      {pct(share)} <span className="muted">/ goal {pct(b.target)}</span>{" "}
                      <span className={ok ? "good" : "bad"}>{ok ? "✓ on track" : "✗ off track"}</span>
                    </span>
                  </div>
                  <div className="bar-track" title={`${usd(b.actual)} of ${usd(s.income)}`}>
                    <div className="bar-fill" style={{ width: `${Math.min(100, share * 100)}%`, background: b.color }} />
                    <div className="bar-target" style={{ left: `${b.target * 100}%` }} aria-hidden />
                  </div>
                  <span className="muted small">{usd(b.actual)} · {b.hint}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card wide">
        <h2>Savings tips for this month</h2>
        <ul className="tips">
          {tips.map((t) => (
            <li key={t.id} className={`tip ${t.severity}`}>
              <div className="tip-body">
                <strong>
                  <span className="sev" aria-hidden>{t.severity === "critical" ? "⛔" : t.severity === "serious" ? "⚠️" : t.severity === "warning" ? "💡" : "✅"}</span> {t.title}
                </strong>
                <p>{t.detail}</p>
                {t.lesson && (
                  <button className="link small" onClick={() => goTo("learn", t.lesson)}>
                    Learn: {LESSONS.find((l) => l.id === t.lesson)?.title} →
                  </button>
                )}
              </div>
              {t.monthly > 0 && <span className="save">save {usd(t.monthly)}/mo</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Money Score & penalties</h2>
        <ScoreRing score={score} />
        {score.penaltyJar > 0 && (
          <div className="callout bad">
            <strong>Penalty jar: {usd(score.penaltyJar)}</strong>
            <p className="small">
              You went over budget by this much. Accountability rule: move the same amount from checking into savings this week. Do it,
              and the “Moved money into savings” bonus shows up next month.
            </p>
          </div>
        )}
        <p className="muted small">
          Score starts at 100. You lose points for spending more than you earn, saving under 20%, paying interest or late fees, going over budget,
          and letting wants pass 30% of income. You earn points back by saving and finishing lessons.
        </p>
      </section>

      <section className="card">
        <h2>Recurring charges</h2>
        {!recurring.length ? (
          <p className="muted empty">No repeating charges found yet (needs 2+ months of data).</p>
        ) : (
          <>
            <ul className="list">
              {recurring.map((r) => (
                <li key={r.key}>
                  <span>{categoryInfo(r.category).emoji} {r.label}</span>
                  <span>{usd(r.monthly, true)}/mo</span>
                </li>
              ))}
            </ul>
            <p className="muted small">Total {usd(recurring.reduce((a, r) => a + r.monthly, 0), true)}/mo · {usd(recurring.reduce((a, r) => a + r.monthly, 0) * 12)}/yr. Cancel anything you haven't used in 30 days.</p>
          </>
        )}
      </section>
    </div>
  );
}
