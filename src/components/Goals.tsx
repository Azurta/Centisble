import { useEffect, useState } from "react";
import { api, type FeedPost } from "../api";
import { monthLabel, pct, usd } from "../format";
import { goalProgress, type Goal, type GoalProgress } from "../lib/goals";
import { STATIC, type AppData } from "../useAppData";

export function Goals({ data, compact = false }: { data: AppData; compact?: boolean }) {
  const [adding, setAdding] = useState(false);
  const [celebrate, setCelebrate] = useState<Goal>();
  const progress = data.goals.map((g) => goalProgress(g, data.accounts));
  const update = (id: string, patch: Partial<Goal>) => data.setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const reached = data.goals.filter((g) => g.reachedAt).length;

  // The moment a goal is reached (added money, or the linked account grew): celebrate once.
  const justReached = progress.find((p) => p.done && !p.goal.reachedAt);
  useEffect(() => {
    if (!justReached) return;
    update(justReached.goal.id, { reachedAt: new Date().toISOString().slice(0, 10) });
    setCelebrate(justReached.goal);
  }, [justReached?.goal.id]);

  return (
    <section className="card">
      {celebrate && <Celebration goal={celebrate} onShared={() => update(celebrate.id, { shared: true })} onClose={() => setCelebrate(undefined)} />}
      <div className="card-head">
        <h2>Savings goals {reached > 0 && <span className="pill good-pill" title="Goals reached">🏅 {reached} reached</span>}</h2>
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
          <span className="good">
            🏅 Goal reached{p.goal.reachedAt ? ` ${shortDate(p.goal.reachedAt)}` : ""}
            {!compact && !STATIC && !p.goal.shared && (
              <> · <button className="link small" onClick={async () => { await shareGoal(p.goal); onUpdate({ shared: true }); }}>Share with family</button></>
            )}
            {p.goal.shared && <span className="muted"> · shared</span>}
          </span>
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

const shortDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shareGoal = (g: Goal) => api.shareGoal(g.name, g.target).catch(() => undefined);

/** Shown once when a goal is reached: the reward, and an optional share to the household. */
function Celebration({ goal, onShared, onClose }: { goal: Goal; onShared: () => void; onClose: () => void }) {
  const [shared, setShared] = useState(false);
  return (
    <div className="celebrate" role="status">
      <div className="confetti" aria-hidden>{["🎉", "✨", "🎊", "💸", "🏅"].map((c, i) => <span key={i} style={{ animationDelay: `${i * 0.12}s` }}>{c}</span>)}</div>
      <strong>You reached {goal.name}!</strong>
      <span className="small">{usd(goal.target)} saved. That's +3 points on your Money Score and a new badge.</span>
      <div className="row">
        {!STATIC && (
          <button className="btn" disabled={shared} onClick={async () => { await shareGoal(goal); setShared(true); onShared(); }}>
            {shared ? "Shared with family ✓" : "Share with family"}
          </button>
        )}
        <button className="btn secondary" onClick={onClose}>{shared ? "Done" : "Keep it private"}</button>
      </div>
    </div>
  );
}

const CHEERS = ["🎉", "👏", "🔥", "💪", "❤️"];
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/** Goals people in the household chose to share, with cheers. Hidden for a one-person account with nothing shared. */
export function MilestonesHub({ meId }: { meId?: string }) {
  const [feed, setFeed] = useState<{ posts: FeedPost[]; people: number }>();
  const load = () => api.feed().then(setFeed).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  if (!feed || (feed.people < 2 && !feed.posts.length)) return null;
  const cheer = async (id: string, emoji: string) => {
    const { post } = await api.cheer(id, emoji);
    setFeed((f) => f && { ...f, posts: f.posts.map((p) => (p.id === id ? post : p)) });
  };
  return (
    <section className="card">
      <div className="card-head">
        <h2>Milestones</h2>
        <span className="muted small">Your household</span>
      </div>
      {!feed.posts.length ? (
        <p className="muted small">When someone reaches a savings goal and shares it, it shows up here so everyone can cheer them on.</p>
      ) : (
        <ul className="hub">
          {feed.posts.slice(0, 6).map((p) => {
            const mine = p.userId === meId;
            const myCheer = p.cheers.find((c) => c.userId === meId);
            return (
              <li key={p.id}>
                <div className="hub-line">
                  <span className="hub-avatar" aria-hidden>{p.name.slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{mine ? "You" : p.name}</strong> reached <strong>{p.title}</strong>{p.amount ? ` (${usd(p.amount)})` : ""} 🎉
                    <span className="muted small"> · {ago(p.at)}</span>
                  </span>
                </div>
                <div className="hub-cheers">
                  {p.cheers.length > 0 && (
                    <span className="small muted">{p.cheers.map((c) => c.emoji).join("")} {p.cheers.map((c) => (c.userId === meId ? "you" : c.name)).join(", ")}</span>
                  )}
                  {!mine && (
                    <span className="cheer-row">
                      {CHEERS.map((e) => (
                        <button key={e} className={`cheer ${myCheer?.emoji === e ? "on" : ""}`} aria-label={`Cheer ${e}`} aria-pressed={myCheer?.emoji === e} onClick={() => cheer(p.id, e)}>{e}</button>
                      ))}
                    </span>
                  )}
                  {mine && <button className="link small" onClick={async () => { await api.unshare(p.id); load(); }}>Remove</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
