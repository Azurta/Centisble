import { useMemo, useState } from "react";
import { usd } from "../format";
import { canAfford, usualDailySpend } from "../lib/afford";
import { tidyName } from "../lib/bills";
import { goalProgress } from "../lib/goals";
import { safeToSpend } from "../lib/safeToSpend";
import type { AppData } from "../useAppData";
import { shortDay } from "./Bills";
import type { Nav } from "./Overview";

/** The top of Home: what's safe to spend until payday, and "Can I afford it?". */
export function Hero({ data, nav }: { data: AppData; nav: Nav }) {
  const r = useMemo(() => safeToSpend({ accounts: data.accounts, txs: data.classified, bills: data.bills, goals: data.goals }), [data.accounts, data.classified, data.bills, data.goals]);
  const usual = useMemo(() => usualDailySpend(data.classified), [data.classified]);
  const hasCash = data.accounts.some((a) => !a.hidden && a.source !== "import" && (a.type === "checking" || a.type === "cash") && a.balance != null);
  const [asking, setAsking] = useState(false);
  const [showMath, setShowMath] = useState(false);

  return (
    <section className="hero home-hero">
      {hasCash ? (
        <>
          <span className="hero-label">Safe to spend until {r.paydayFound ? `payday (${shortDay(r.until)})` : shortDay(r.until)}</span>
          <div className={`hero-num ${r.safe < 0 ? "neg" : ""}`}>{usd(r.safe)}</div>
          <button className="hero-sub link-plain" onClick={() => setShowMath((x) => !x)} aria-expanded={showMath}>
            {r.safe > 0 ? `About ${usd(r.perDay)}/day for ${r.days} ${r.days === 1 ? "day" : "days"}, after bills due before payday` : "Bills due before payday are more than what's in checking"}
            {" "}{showMath ? "▴" : "▾"}
          </button>
          {showMath && (
            <ul className="hero-list">
              <li><span>In checking & cash</span><strong>{usd(r.cash, true)}</strong></li>
              {r.dueBeforePayday.map((d) => (
                <li key={d.name + d.date}><span>− {tidyName(d.name)} · {shortDay(d.date)}{d.expected ? " (usual)" : ""}</span><strong>{usd(d.amount, true)}</strong></li>
              ))}
              {r.goals > 0 && <li><span>− Set aside for goals</span><strong>{usd(r.goals, true)}</strong></li>}
              {!data.bills.length && <li><button className="link-plain" onClick={() => nav.tab("bills")}>Add your bills so they're counted →</button></li>}
            </ul>
          )}
        </>
      ) : (
        <>
          <span className="hero-label">Safe to spend until payday</span>
          <p className="hero-sub">Connect your checking account, or start tracking cash, to see what's safe to spend.</p>
        </>
      )}
      <div className="hero-actions">
        {hasCash && <button className="hero-btn primary" onClick={() => setAsking((a) => !a)} aria-expanded={asking}>Can I afford it?</button>}
        {data.status?.receipts?.enabled ? (
          <button className="hero-btn" onClick={() => nav.tab("transactions#receipt")}>Scan a receipt</button>
        ) : (
          <button className="hero-btn" onClick={() => nav.tab("transactions")}>Add a purchase</button>
        )}
      </div>
      {asking && <Afford data={data} safe={r} usual={usual} />}
    </section>
  );
}

function Afford({ data, safe, usual }: { data: AppData; safe: ReturnType<typeof safeToSpend>; usual: number }) {
  const [price, setPrice] = useState("");
  const n = parseFloat(price.replace(/[$,]/g, ""));
  const goals = data.goals.map((g) => ({ name: g.name, saved: goalProgress(g, data.accounts).saved }));
  const a = Number.isFinite(n) && n > 0 ? canAfford(n, safe, usual, goals) : undefined;
  return (
    <div className="afford">
      <label className="afford-input">
        <span>How much is it?</span>
        <input id="afford-price" inputMode="decimal" placeholder="$180" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
      </label>
      {a && (
        <div className={`afford-answer ${a.verdict}`} role="status">
          <strong>{a.verdict === "yes" ? "Yes, you can." : a.verdict === "tight" ? "Yes, but it's tight." : "Not right now."}</strong>
          <span>
            {a.verdict === "no"
              ? `That's ${usd(-a.left)} more than what's safe to spend until ${shortDay(safe.until)}.`
              : `It leaves ${usd(a.left)} for ${safe.days} days (${usd(a.leftPerDay)}/day). You usually spend about ${usd(a.usualPerDay)}/day.`}
            {a.verdict !== "yes" && safe.paydayFound && ` Waiting until payday on ${shortDay(safe.until)} is safer.`}
          </span>
          {a.verdict !== "yes" && a.fromGoals.length > 0 && <span>Or pay for it from your "{a.fromGoals[0].name}" goal ({usd(a.fromGoals[0].saved)} saved).</span>}
        </div>
      )}
    </div>
  );
}
