import { usd } from "../format";
import { suggestBudgets, type MonthSummary } from "../lib/analytics";
import { SPENDING_CATEGORIES } from "../lib/categories";
import type { Budgets as BudgetMap } from "../lib/types";
import type { AppData } from "../useAppData";

export function Budgets({ data, summary, history }: { data: AppData; summary: MonthSummary; history: MonthSummary[] }) {
  const { budgets, setBudgets } = data;
  const total = Object.values(budgets).reduce((a, b) => a + (b ?? 0), 0);
  const suggest = () => {
    const full = history.filter((m) => m.month !== summary.month || history.length === 1);
    setBudgets(suggestBudgets(full.length ? full : history));
  };
  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Monthly budgets</h2>
          <button className="btn secondary" onClick={suggest}>✨ Suggest from my history</button>
        </div>
        <p className="muted small">
          Suggestions keep your needs at their average and scale “wants” down to fit the 30% rule. Budgeted {usd(total)}
          {summary.income > 0 && <> of {usd(summary.income)} income ({Math.round((total / summary.income) * 100)}%)</>}.
        </p>
        <div className="budgets">
          {SPENDING_CATEGORIES.map((c) => {
            const spent = Math.max(0, summary.byCategory[c.id] ?? 0);
            const limit = budgets[c.id];
            const ratio = limit ? spent / limit : 0;
            const state = !limit ? "" : ratio > 1 ? "critical" : ratio > 0.85 ? "warning" : "good";
            return (
              <div className="budget" key={c.id}>
                <div className="budget-head">
                  <span>{c.emoji} {c.label} <span className="muted small">{c.bucket}</span></span>
                  <label className="budget-input">
                    $<input
                      inputMode="decimal"
                      aria-label={`${c.label} budget`}
                      placeholder="—"
                      value={limit ?? ""}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setBudgets((b: BudgetMap) => ({ ...b, [c.id]: Number.isFinite(v) && v > 0 ? v : undefined }));
                      }}
                    />
                  </label>
                </div>
                <div className="bar-track">
                  <div className={`bar-fill status-${state || "none"}`} style={{ width: `${Math.min(100, limit ? ratio * 100 : 0)}%` }} />
                </div>
                <span className="small">
                  {usd(spent)} spent
                  {limit ? (
                    ratio > 1 ? <span className="bad"> · ⛔ {usd(spent - limit)} over</span> : <span className="muted"> · {usd(limit - spent)} left</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
