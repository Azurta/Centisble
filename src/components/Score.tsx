import type { MoneyScore } from "../lib/analytics";

export function ScoreRing({ score }: { score: MoneyScore }) {
  const r = 42, c = 2 * Math.PI * r;
  const tone = score.score >= 80 ? "good" : score.score >= 60 ? "warning" : "critical";
  return (
    <div className="score">
      <svg viewBox="0 0 100 100" width="112" height="112" role="img" aria-label={`Money score ${score.score} out of 100, grade ${score.grade}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--track)" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeLinecap="round"
          stroke={`var(--status-${tone})`}
          strokeDasharray={`${(score.score / 100) * c} ${c}`}
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="48" textAnchor="middle" className="score-num">{score.score}</text>
        <text x="50" y="66" textAnchor="middle" className="score-grade">Grade {score.grade}</text>
      </svg>
      <ul className="score-items">
        {score.penalties.map((p) => (
          <li key={p.label}><span className="pen">{p.points}</span> {p.label}</li>
        ))}
        {score.bonuses.map((b) => (
          <li key={b.label}><span className="bon">+{b.points}</span> {b.label}</li>
        ))}
        {!score.penalties.length && !score.bonuses.length && <li className="muted">No activity yet.</li>}
      </ul>
    </div>
  );
}
