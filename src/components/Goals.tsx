import { useState } from "react";
import { monthLabel, pct, usd } from "../format";
import { goalProgress, type Goal, type GoalProgress } from "../lib/goals";
import type { AppData } from "../useAppData";

export function Goals({ data, compact = false }: { data: AppData; compact?: boolean }) {
  const [adding, setAdding] = useState(false);
  const progress = data.goals.map((g) => goalProgress(g, data.accounts));
  const update = (id: string, patch: Partial<Goal>) => data.setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  return (
    <section className="card">
      <div className="card-head">
        <h2>Savings goals</h2>
        {!compact && <button className="link" onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ New goal"}</button>}
      </div>
      {!progress.length && !adding && (
        <p className="muted small">
          Save toward something specific: an emergency fund, a trip, a car. Set a target and date and see how much to put away each month.
          {!compact && " Start with an emergency fund: $1,000 first, then 3 months of expenses."}
        </p>
      )}
      <ul className="goal-list">
        {progress.map((p) => (
          <GoalRow key={p.goal.id} p={p} compact={compact} data={data} onUpdate={(patch) => update(p.goal.id, patch)} />
        ))}
      </ul>
      {adding && !compact && (
        <GoalForm
          data={data}
          onSave={(g) => {
            data.setGoals((gs) => [...gs, { ...g, id: `goal-${Date.now()}` }]);
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}

function GoalRow({ p, compact, data, onUpdate }: { p: GoalProgress; compact: boolean; data: AppData; onUpdate: (patch: Partial<Goal>) => void }) {
  const [add, setAdd] = useState("");
  const [editing, setEditing] = useState(false);
  const linked = p.goal.accountId ? data.accounts.find((a) => a.id === p.goal.accountId) : undefined;
  return (
    <li className="goal">
      <div className="split-head">
        <strong>{p.goal.name}</strong>
        <span className="small">
          {usd(p.saved)} <span className="muted">of {usd(p.goal.target)}</span>
        </span>
      </div>
      <div className="bar-track" title={pct(p.share)}>
        <div className={`bar-fill ${p.done ? "status-good" : ""}`} style={{ width: `${p.share * 100}%` }} />
      </div>
      <div className="small muted goal-meta">
        {p.done ? (
          <span className="good">Goal reached</span>
        ) : (
          <>
            <span>{usd(p.left)} to go</span>
            {p.goal.deadline && <span> · by {monthLabel(p.goal.deadline)}</span>}
            {p.perMonth != null && <span> · <strong className="text">{usd(Math.ceil(p.perMonth))}/month</strong> to get there</span>}
            {linked && <span> · tracking {linked.name}</span>}
          </>
        )}
      </div>
      {!compact && (
        <div className="row">
          {!p.goal.accountId && !p.done && (
            <form
              className="copy-row"
              onSubmit={(e) => {
                e.preventDefault();
                const n = parseFloat(add);
                if (!Number.isFinite(n)) return;
                onUpdate({ saved: Math.max(0, p.goal.saved + n) });
                setAdd("");
              }}
            >
              <input id={`goal-add-${p.goal.id}`} inputMode="decimal" placeholder="Amount" value={add} onChange={(e) => setAdd(e.target.value)} aria-label={`Add money to ${p.goal.name}`} />
              <button className="btn secondary" disabled={!add}>Add money</button>
            </form>
          )}
          <button className="link small" onClick={() => setEditing((x) => !x)}>{editing ? "Close" : "Edit"}</button>
          <button className="link small bad" onClick={() => data.setGoals((gs) => gs.filter((g) => g.id !== p.goal.id))}>Delete</button>
        </div>
      )}
      {editing && (
        <GoalForm
          data={data}
          initial={p.goal}
          onSave={(g) => {
            onUpdate(g);
            setEditing(false);
          }}
        />
      )}
    </li>
  );
}

function GoalForm({ data, initial, onSave }: { data: AppData; initial?: Goal; onSave: (g: Omit<Goal, "id">) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [target, setTarget] = useState(initial ? String(initial.target) : "");
  const [saved, setSaved] = useState(initial ? String(initial.saved) : "0");
  const [deadline, setDeadline] = useState(initial?.deadline ?? "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const savingsAccounts = data.accounts.filter((a) => (a.type === "savings" || a.type === "checking") && !a.hidden);
  const id = initial?.id ?? "new";
  const valid = name.trim() && Number(target) > 0;
  return (
    <form
      className="form-grid mt-s"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ name: name.trim(), target: Number(target), saved: Number(saved) || 0, deadline: deadline || undefined, accountId: accountId || undefined });
      }}
    >
      <label>Goal<input id={`goal-name-${id}`} placeholder="e.g. Emergency fund" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Target ($)<input id={`goal-target-${id}`} inputMode="decimal" placeholder="1000" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
      <label>By (optional)<input id={`goal-deadline-${id}`} type="month" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
      <label>
        Track progress from
        <select id={`goal-acct-${id}`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Money I add by hand</option>
          {savingsAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} balance</option>)}
        </select>
      </label>
      {!accountId && (
        <label>Already saved ($)<input id={`goal-saved-${id}`} inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} /></label>
      )}
      <div className="row span-2">
        <button className="btn" disabled={!valid}>{initial ? "Save goal" : "Create goal"}</button>
      </div>
    </form>
  );
}
