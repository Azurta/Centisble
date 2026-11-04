import { useEffect, useState } from "react";
import { api, type FeedbackEntry } from "../api";
import { APP_NAME, CONTACT_EMAIL } from "../brand";

const PAY = ["$0, I'd only use the free plan", "$2–3 a month", "$4–5 a month", "$6–8 a month", "More than $8 a month"];

/** The tester feedback form. Every question is optional; one answer is enough to send. */
export function Feedback({ tab, onSent }: { tab: string; onSent?: () => void }) {
  const [recommend, setRecommend] = useState<number>();
  const [wouldPay, setWouldPay] = useState("");
  const [confusing, setConfusing] = useState("");
  const [wrongNumber, setWrongNumber] = useState("");
  const [favorite, setFavorite] = useState("");
  const [other, setOther] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      const context = `${tab} · ${window.innerWidth}px · ${navigator.userAgent.slice(0, 160)}`;
      await api.sendFeedback({ recommend, wouldPay, confusing, wrongNumber, favorite, other, context });
      setState("sent");
      try { localStorage.setItem("avryo.feedbackSent", new Date().toISOString()); } catch { /* storage blocked */ }
      onSent?.();
    } catch (err) {
      setError((err as Error).message || "Couldn't send. Check your connection and try again.");
      setState("error");
    }
  };

  if (state === "sent")
    return (
      <section className="card feedback">
        <h2>Thanks, that helps a lot.</h2>
        <p>Your answers went straight to the person building {APP_NAME}. Send more any time from the menu, as often as you like.</p>
        <button className="btn secondary" onClick={() => { setState("idle"); setConfusing(""); setWrongNumber(""); setFavorite(""); setOther(""); }}>Send more feedback</button>
      </section>
    );

  return (
    <form className="card feedback" onSubmit={send}>
      <h2>Tell us what you think</h2>
      <p className="muted">You're one of the first people to try {APP_NAME}. Answer any of these; skip the rest. Short answers are perfect.</p>

      <fieldset className="nps">
        <legend>How likely are you to recommend {APP_NAME} to a friend?</legend>
        <div className="nps-row" role="radiogroup" aria-label="0 is not at all likely, 10 is extremely likely">
          {Array.from({ length: 11 }, (_, n) => (
            <button type="button" key={n} role="radio" aria-checked={recommend === n} className={recommend === n ? "on" : ""} onClick={() => setRecommend(n)}>{n}</button>
          ))}
        </div>
        <div className="nps-ends small muted"><span>Not likely</span><span>Very likely</span></div>
      </fieldset>

      <label className="field">
        <span>What was confusing or hard to find?</span>
        <textarea id="fb-confusing" rows={3} value={confusing} onChange={(e) => setConfusing(e.target.value)} placeholder="e.g. I couldn't tell where to add my rent" />
      </label>
      <label className="field">
        <span>Did any number look wrong? Which one, and what did you expect?</span>
        <textarea id="fb-wrong" rows={3} value={wrongNumber} onChange={(e) => setWrongNumber(e.target.value)} placeholder="e.g. Safe to spend said $741, but I have $500 in checking" />
      </label>
      <label className="field">
        <span>What did you like most?</span>
        <textarea id="fb-favorite" rows={2} value={favorite} onChange={(e) => setFavorite(e.target.value)} />
      </label>
      <label className="field">
        <span>What would you pay for it each month?</span>
        <select id="fb-pay" value={wouldPay} onChange={(e) => setWouldPay(e.target.value)}>
          <option value="">Choose one (optional)</option>
          {PAY.map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Anything else? Bugs, ideas, features you'd want</span>
        <textarea id="fb-other" rows={3} value={other} onChange={(e) => setOther(e.target.value)} />
      </label>

      {state === "error" && <p className="bad small" role="alert">{error}</p>}
      <div className="row">
        <button className="btn" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send feedback"}</button>
        <span className="muted small">Goes only to the app's owner. Your bank data is never attached.{CONTACT_EMAIL && <> Prefer email? {CONTACT_EMAIL}</>}</span>
      </div>
    </form>
  );
}

/** Owner only: everything testers have sent, newest first, with a quick summary. */
export function FeedbackInbox() {
  const [entries, setEntries] = useState<(FeedbackEntry & { name: string; email?: string })[]>();
  const [err, setErr] = useState("");
  useEffect(() => { api.feedbackList().then((r) => setEntries(r.entries)).catch((e) => setErr((e as Error).message)); }, []);
  if (err) return null;
  if (!entries) return null;
  const scores = entries.map((e) => e.recommend).filter((n): n is number => n != null);
  const nps = scores.length ? Math.round(((scores.filter((n) => n >= 9).length - scores.filter((n) => n <= 6).length) / scores.length) * 100) : undefined;
  const payers = entries.filter((e) => e.wouldPay && !e.wouldPay.startsWith("$0")).length;
  return (
    <section className="card wide">
      <div className="card-head"><h2>Tester feedback</h2><span className="muted small">{entries.length} {entries.length === 1 ? "response" : "responses"}</span></div>
      {!entries.length ? (
        <p className="muted small">Nothing yet. Testers send feedback from the menu (tap their initial, then Send feedback). You'll get a notification for each one.</p>
      ) : (
        <>
          <div className="fb-stats">
            <div><span className="muted small">Recommend score (NPS: −100 to 100; 9–10 count for, 0–6 against)</span><strong>{nps ?? "—"}</strong></div>
            <div><span className="muted small">Would pay something</span><strong>{payers} of {entries.filter((e) => e.wouldPay).length}</strong></div>
            <div><span className="muted small">Reported a wrong number</span><strong>{entries.filter((e) => e.wrongNumber).length}</strong></div>
          </div>
          <ul className="fb-list">
            {entries.map((e) => (
              <li key={e.id}>
                <div className="fb-who"><strong>{e.name}</strong> <span className="muted small">{e.email} · {new Date(e.at).toLocaleDateString()}{e.recommend != null ? ` · recommend ${e.recommend}/10` : ""}{e.wouldPay ? ` · ${e.wouldPay}` : ""}</span></div>
                {e.confusing && <p><span className="fb-q">Confusing:</span> {e.confusing}</p>}
                {e.wrongNumber && <p><span className="fb-q bad">Wrong number:</span> {e.wrongNumber}</p>}
                {e.favorite && <p><span className="fb-q good">Liked:</span> {e.favorite}</p>}
                {e.other && <p><span className="fb-q">Other:</span> {e.other}</p>}
                {e.context && <p className="muted small">{e.context}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
