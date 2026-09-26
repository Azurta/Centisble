import { useState } from "react";
import { usePalette } from "../colors";
import { usd } from "../format";
import { suggestBudgets, type MonthSummary } from "../lib/analytics";
import { MISC_ID, type CategoryInfo } from "../lib/categories";
import { daysLeft, type LimitStatus } from "../lib/limits";
import type { Bucket } from "../lib/types";
import type { AppData } from "../useAppData";

interface Props {
  data: AppData;
  summary: MonthSummary;
  history: MonthSummary[];
  statuses: LimitStatus[];
}

const STATE_LABEL = { none: "", ok: "On track", warn: "Close to limit", over: "Over limit" } as const;

export function Categories({ data, summary, history, statuses }: Props) {
  const { budgets, setBudgets, categories } = data;
  const total = categories.reduce((a, c) => a + (budgets[c.id] ?? 0), 0);
  const days = daysLeft(summary.month);
  const byId = new Map(statuses.map((s) => [s.id, s]));

  const suggest = () => {
    const past = history.filter((m) => m.month !== summary.month);
    const s = suggestBudgets(past.length ? past : history);
    setBudgets((b) => ({ ...s, ...b }));
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Categories & limits</h2>
          <button className="btn secondary" onClick={suggest} disabled={!history.length}>Fill empty limits from history</button>
        </div>
        <p className="muted small">
          Give each category a monthly limit. For “want” categories you'll get a warning when you reach{" "}
          <select id="alert-at" aria-label="Warn at" value={data.alertAt} onChange={(e) => data.setAlertAt(Number(e.target.value))}>
            {[0.5, 0.6, 0.7, 0.75, 0.8, 0.9].map((v) => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
          </select>{" "}
          of a limit. Going over costs Money Score points and adds the overage to your penalty jar.
        </p>
        <p className="small">
          Limits total <strong>{usd(total)}</strong>
          {summary.income > 0 && <> of {usd(summary.income)} income ({Math.round((total / summary.income) * 100)}%)</>}
          {days > 0 && <> · {days} day{days > 1 ? "s" : ""} left this month</>}
        </p>
      </section>

      <div className="cat-list">
        {categories.map((c) => (
          <CategoryRow key={c.id} c={c} status={byId.get(c.id)} data={data} showPerDay={days > 0} />
        ))}
      </div>

      <AddCategory data={data} />
    </div>
  );
}

function CategoryRow({ c, status, data, showPerDay }: { c: CategoryInfo; status?: LimitStatus; data: AppData; showPerDay: boolean }) {
  const pal = usePalette();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const limit = data.budgets[c.id];
  const spent = status?.spent ?? 0;
  const state = status?.state ?? "none";
  const fill = !limit ? "none" : state === "over" ? "critical" : state === "warn" ? "warning" : "good";

  return (
    <section className={`card cat ${state}`}>
      <div className="cat-head">
        <span className="swatch" style={{ background: pal.category(c.id) }} aria-hidden />
        <strong className="cat-name">{c.label}</strong>
        <span className="muted small">{c.bucket === "needs" ? "Need" : "Want"}</span>
        {(state === "warn" || state === "over") && (
          <span className={`chip ${state}`}>{STATE_LABEL[state]}</span>
        )}
        <label className="budget-input">
          <span className="muted small">Limit</span> $
          <input
            id={`limit-${c.id}`}
            inputMode="decimal"
            aria-label={`${c.label} monthly limit`}
            placeholder="none"
            value={limit ?? ""}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              data.setBudgets((b) => ({ ...b, [c.id]: Number.isFinite(v) && v > 0 ? v : undefined }));
            }}
          />
        </label>
      </div>
      <div className="bar-track">
        <div className={`bar-fill status-${fill}`} style={{ width: `${limit ? Math.min(100, (spent / limit) * 100) : 0}%` }} />
        {limit ? <div className="bar-target" style={{ left: `${data.alertAt * 100}%` }} title={`Warning at ${Math.round(data.alertAt * 100)}%`} aria-hidden /> : null}
      </div>
      <div className="cat-foot small">
        <span>
          {usd(spent)} spent
          {limit ? (
            state === "over" ? (
              <span className="bad"> · {usd(spent - limit)} over</span>
            ) : (
              <span className="muted"> · {usd(limit - spent)} left{showPerDay && status ? ` · ${usd(status.perDay)}/day` : ""}</span>
            )
          ) : (
            <span className="muted"> · no limit</span>
          )}
        </span>
        <span className="cat-actions">
          <button className="link small" onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Edit"}</button>
          {c.id !== MISC_ID &&
            (confirmDelete ? (
              <>
                <button className="link small bad" onClick={() => data.removeCategory(c.id)}>Delete (purchases move to Misc)</button>
                <button className="link small" onClick={() => setConfirmDelete(false)}>Keep</button>
              </>
            ) : (
              <button className="link small" onClick={() => setConfirmDelete(true)}>Delete</button>
            ))}
        </span>
      </div>
      {editing && (
        <div className="form-grid mt-s">
          <label>Name<input id={`name-${c.id}`} value={c.label} onChange={(e) => data.updateCategory(c.id, { label: e.target.value })} /></label>
          <label>
            Type
            <select id={`bucket-${c.id}`} value={c.bucket} onChange={(e) => data.updateCategory(c.id, { bucket: e.target.value as Bucket })}>
              <option value="needs">Need (rent, bills, groceries…)</option>
              <option value="wants">Want (fun, eating out, shopping…)</option>
            </select>
          </label>
          <label>
            Auto-sort words <span className="muted">(comma separated)</span>
            <input
              id={`kw-${c.id}`}
              placeholder="e.g. starbucks, dunkin"
              defaultValue={(c.keywords ?? []).join(", ")}
              onBlur={(e) => data.updateCategory(c.id, { keywords: splitWords(e.target.value) })}
            />
          </label>
        </div>
      )}
    </section>
  );
}

const splitWords = (s: string) => s.split(",").map((w) => w.trim()).filter(Boolean);

function AddCategory({ data }: { data: AppData }) {
  const [label, setLabel] = useState("");
  const [bucket, setBucket] = useState<Bucket>("wants");
  const [limit, setLimit] = useState("");
  const [words, setWords] = useState("");
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        const n = parseFloat(limit);
        data.addCategory({ label: label.trim(), emoji: "", bucket, keywords: splitWords(words) }, Number.isFinite(n) && n > 0 ? n : undefined);
        setLabel("");
        setLimit("");
        setWords("");
      }}
    >
      <h2>Add a category</h2>
      <div className="form-grid">
        <label>Name<input id="new-cat-name" placeholder="e.g. Coffee" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label>
          Type
          <select id="new-cat-bucket" value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)}>
            <option value="wants">Want</option>
            <option value="needs">Need</option>
          </select>
        </label>
        <label>Monthly limit ($)<input id="new-cat-limit" inputMode="decimal" placeholder="optional" value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
        <label className="span-2">
          Auto-sort words <span className="muted">(purchases containing these go here automatically)</span>
          <input id="new-cat-words" placeholder="e.g. starbucks, dunkin, dutch bros" value={words} onChange={(e) => setWords(e.target.value)} />
        </label>
      </div>
      <button className="btn mt-s" disabled={!label.trim()}>Add category</button>
    </form>
  );
}
