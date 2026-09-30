import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { APP_NAME } from "../brand";
import { billsCalendar, calendarLinks } from "../lib/ics";
import { STATIC } from "../useAppData";
import { monthLabel, usd } from "../format";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePalette } from "../colors";
import { billsForMonth, billsYearToDate, billTotals, suggestBills, type Bill, type BillOccurrence, type BillStatus, type BillYearMonth } from "../lib/bills";
import { spendingCategories } from "../lib/categories";
import { isDebt } from "../lib/networth";
import type { AppData } from "../useAppData";

const STATUS_TEXT: Record<BillStatus, string> = {
  paid: "Paid",
  overdue: "Overdue",
  "due-today": "Due today",
  "due-soon": "Due soon",
  upcoming: "Upcoming",
};
const STATUS_DOT: Record<BillStatus, string> = { paid: "good", overdue: "critical", "due-today": "critical", "due-soon": "warning", upcoming: "" };

export const shortDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function statusLine(o: BillOccurrence): string {
  if (o.status === "paid") return `Paid ${o.payment ? shortDay(o.payment.date) : ""}`.trim();
  if (o.status === "overdue") return `${Math.abs(o.daysUntil)} day${Math.abs(o.daysUntil) === 1 ? "" : "s"} overdue`;
  if (o.status === "due-today") return "Due today";
  return `Due in ${o.daysUntil} day${o.daysUntil === 1 ? "" : "s"}`;
}

export function Bills({ data, month }: { data: AppData; month: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const today = new Date();
  const thisMonth = today.toISOString().slice(0, 7);
  const occ = useMemo(() => billsForMonth(data.bills, data.classified, month, today), [data.bills, data.classified, month]);
  const totals = billTotals(occ);
  const suggestions = useMemo(
    () => suggestBills(data.classified, data.accounts, data.bills, thisMonth),
    [data.classified, data.accounts, data.bills, thisMonth],
  );
  const next = occ.find((o) => o.status !== "paid" && o.daysUntil >= 0);

  const save = (b: Bill) => data.setBills((list) => (list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [...list, b]));
  const add = (b: Omit<Bill, "id">) => save({ ...b, id: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Bills for {monthLabel(month)}</h2>
          {month !== thisMonth && <span className="muted small">Pick this month at the top to see what's due now</span>}
        </div>
        {data.bills.length ? (
          <>
            <div className="debt-totals bill-totals">
              <div><span className="muted small">Total</span><strong>{usd(totals.total)}</strong></div>
              <div><span className="muted small">Paid</span><strong className="good">{usd(totals.paid)}</strong></div>
              <div><span className="muted small">Still to pay</span><strong>{usd(totals.left)}</strong></div>
            </div>
            {next && month === thisMonth && (
              <p className="small">
                Next up: <strong>{next.bill.name}</strong>, {usd(next.bill.amount)} {next.daysUntil === 0 ? "today" : `on ${shortDay(next.date)}`}.
              </p>
            )}
            <Calendar month={month} occ={occ} onPick={setEditing} />
          </>
        ) : (
          <p className="muted small">
            Add the bills you pay every month (rent, phone, insurance, card payments) to see what's due, what's paid, and get a reminder a few days
            before each due date. Start with the suggestions below.
          </p>
        )}
      </section>

      {data.bills.length > 0 && <CalendarSync bills={data.bills} />}

      <BillsYear rows={billsYearToDate(data.bills, data.classified, month, today)} year={month.slice(0, 4)} />

      {occ.length > 0 && (
        <section className="card">
          <h2>All bills</h2>
          <ul className="bill-list">
            {occ.map((o) => (
              <li key={o.bill.id} className={`bill ${o.status}`}>
                <div className="bill-main">
                  <span className={`dot ${STATUS_DOT[o.status]}`} aria-hidden />
                  <div className="bill-text">
                    <strong>{o.bill.name}</strong>
                    <span className="muted small">
                      {shortDay(o.date)} · {statusLine(o)}
                      {o.bill.autopay ? " · autopay" : ""}
                    </span>
                  </div>
                  <span className="bill-amt">{usd(o.bill.amount, true)}</span>
                  <span className={`chip ${o.status === "overdue" || o.status === "due-today" ? "over" : o.status === "due-soon" ? "warn" : o.status === "paid" ? "done" : ""}`}>
                    {STATUS_TEXT[o.status]}
                  </span>
                  <button className="link small" onClick={() => setEditing(editing === o.bill.id ? null : o.bill.id)}>
                    {editing === o.bill.id ? "Close" : "Edit"}
                  </button>
                </div>
                {editing === o.bill.id && (
                  <BillForm
                    data={data}
                    initial={o.bill}
                    onSave={(b) => {
                      save({ ...o.bill, ...b });
                      setEditing(null);
                    }}
                    onDelete={() => {
                      data.setBills((list) => list.filter((x) => x.id !== o.bill.id));
                      setEditing(null);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="card">
          <h2>Suggested from your accounts</h2>
          <p className="muted small">These repeat every month or have a due date from your bank. Add the ones you want to track.</p>
          <ul className="list">
            {suggestions.map((s) => (
              <li key={s.accountId ?? s.match}>
                <span>
                  {s.name} <span className="muted small">{usd(s.amount, true)} · around the {ordinal(s.dueDay)} · {s.why}</span>
                </span>
                <button className="btn secondary" onClick={() => add({ ...s, remindDays: 3 })}>Add</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Add a bill</h2>
        <BillForm data={data} onSave={add} />
      </section>
    </div>
  );
}

const ordinal = (n: number) => {
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] || suffix[v] || suffix[0]}`;
};

function Calendar({ month, occ, onPick }: { month: string; occ: BillOccurrence[]; onPick: (id: string) => void }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const todayYmd = new Date().toISOString().slice(0, 10);
  const byDay = new Map<number, BillOccurrence[]>();
  for (const o of occ) {
    const d = Number(o.date.slice(8, 10));
    byDay.set(d, [...(byDay.get(d) ?? []), o]);
  }
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return (
    <div className="calendar" role="grid" aria-label={`Bills calendar for ${monthLabel(month)}`}>
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
        <div key={d} className="cal-head" role="columnheader">{d}</div>
      ))}
      {cells.map((d, i) => {
        const items = d ? byDay.get(d) ?? [] : [];
        const ymd = d ? `${month}-${String(d).padStart(2, "0")}` : "";
        return (
          <div key={i} className={`cal-cell ${d ? "" : "blank"} ${ymd === todayYmd ? "today" : ""}`} role="gridcell">
            {d && <span className="cal-day">{d}</span>}
            {items.map((o) => (
              <button key={o.bill.id} className={`cal-bill ${o.status}`} onClick={() => onPick(o.bill.id)} title={`${o.bill.name}: ${usd(o.bill.amount, true)} · ${STATUS_TEXT[o.status]}`}>
                <span className="cal-bill-name">{o.bill.name}</span>
                <span className="cal-bill-amt">{usd(o.bill.amount)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BillForm({ data, initial, onSave, onDelete }: { data: AppData; initial?: Bill; onSave: (b: Omit<Bill, "id">) => void; onDelete?: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 1));
  const [category, setCategory] = useState(initial?.category ?? "bills");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [match, setMatch] = useState(initial?.match ?? "");
  const [remindDays, setRemindDays] = useState(String(initial?.remindDays ?? 3));
  const [autopay, setAutopay] = useState(Boolean(initial?.autopay));
  const debts = data.accounts.filter((a) => isDebt(a) && !a.hidden);
  const idp = initial?.id ?? "new";
  const valid = name.trim() && Number(amount) >= 0 && Number(dueDay) >= 1 && Number(dueDay) <= 31;
  return (
    <form
      className="form-grid mt-s"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSave({
          name: name.trim(),
          amount: Number(amount) || 0,
          dueDay: Number(dueDay),
          category,
          accountId: accountId || undefined,
          match: match.trim() || undefined,
          remindDays: Number(remindDays),
          autopay,
        });
        if (!initial) {
          setName("");
          setAmount("");
          setMatch("");
        }
      }}
    >
      <label>Name<input id={`bill-name-${idp}`} placeholder="e.g. Phone bill" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Amount ($)<input id={`bill-amt-${idp}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>
        Due on day
        <select id={`bill-day-${idp}`} value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ordinal(d)} of the month</option>)}
        </select>
      </label>
      <label>
        Remind me
        <select id={`bill-remind-${idp}`} value={remindDays} onChange={(e) => setRemindDays(e.target.value)}>
          {[0, 1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d === 0 ? "On the due date" : `${d} day${d > 1 ? "s" : ""} before`}</option>)}
        </select>
      </label>
      <label>
        Category
        <select id={`bill-cat-${idp}`} value={category} onChange={(e) => setCategory(e.target.value)}>
          {spendingCategories().map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      {debts.length > 0 && (
        <label>
          Is it a card or loan payment?
          <select id={`bill-acct-${idp}`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">No</option>
            {debts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}
      {!accountId && (
        <label className="span-2">
          How it appears on your statement <span className="muted">(optional, helps spot it as paid)</span>
          <input id={`bill-match-${idp}`} placeholder={name ? name.toLowerCase() : "e.g. verizon"} value={match} onChange={(e) => setMatch(e.target.value)} />
        </label>
      )}
      <label className="check span-2">
        <input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} /> Paid automatically (autopay)
      </label>
      <div className="row span-2">
        <button className="btn" disabled={!valid}>{initial ? "Save" : "Add bill"}</button>
        {onDelete && <button type="button" className="link small bad" onClick={onDelete}>Delete bill</button>}
      </div>
    </form>
  );
}

function BillsYear({ rows, year }: { rows: BillYearMonth[]; year: string }) {
  const pal = usePalette();
  if (rows.length < 1) return null;
  const paid = rows.reduce((a, r) => a + r.paid, 0);
  const onTime = rows.reduce((a, r) => a + r.onTime, 0);
  const late = rows.reduce((a, r) => a + r.late, 0);
  const missed = rows.reduce((a, r) => a + r.missed, 0);
  const total = onTime + late + missed;
  const data = rows.map((r) => ({
    month: new Date(`${r.month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    Paid: Math.round(r.paid),
    "Not paid": Math.round(r.unpaid),
  }));
  return (
    <section className="card">
      <h2>Bills in {year} so far</h2>
      <div className="debt-totals bill-totals">
        <div><span className="muted small">Paid this year</span><strong>{usd(paid)}</strong></div>
        <div>
          <span className="muted small">On time</span>
          <strong className={onTime === total ? "good" : undefined}>{total ? `${onTime} of ${total}` : "—"}</strong>
        </div>
        <div>
          <span className="muted small">Late or missed</span>
          <strong className={late + missed ? "bad" : "good"}>{late + missed}</strong>
        </div>
      </div>
      <div className="chart" role="img" aria-label={`Bills paid per month in ${year}`}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke={pal.grid} />
            <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: pal.axis }} tick={{ fill: pal.muted, fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: pal.muted, fontSize: 12 }} tickFormatter={(v) => usd(v)} width={60} />
            <Tooltip
              cursor={{ fill: pal.grid, opacity: 0.5 }}
              formatter={(v) => usd(Number(v))}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
            />
            <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: "var(--text-2)" }}>{v}</span>} />
            <Bar dataKey="Paid" stackId="b" fill="#12a150" isAnimationActive={false} maxBarSize={36} />
            <Bar dataKey="Not paid" stackId="b" fill="#d92d20" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="muted small">Based on the bills you track now, for months with transactions in the app.</p>
    </section>
  );
}

/**
 * Put bills on Google, Apple or Outlook Calendar. With the server: a private link the calendar app subscribes to,
 * so new or changed bills show up there by themselves. Without it: a one-time .ics file.
 */
function CalendarSync({ bills }: { bills: Bill[] }) {
  const [url, setUrl] = useState<string | null>(null);
  const [server, setServer] = useState(!STATIC);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (STATIC) return;
    api.calendar().then((r) => setUrl(r.url)).catch(() => setServer(false));
  }, []);

  const run = async (f: () => Promise<{ url: string | null }>, done?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      setUrl((await f()).url);
      if (done) setMsg(done);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    const blob = new Blob([billsCalendar(bills, { appName: APP_NAME, appUrl: window.location.origin })], { type: "text/calendar" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${APP_NAME.toLowerCase()}-bills.ics` });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const links = url ? calendarLinks(url, `${APP_NAME} bills`) : null;

  return (
    <section className="card">
      <h2>Add bills to your calendar</h2>
      {links ? (
        <>
          <p className="muted small">
            Each bill shows up on its due date every month, with a reminder before it and on the day. Add or change a bill here
            and your calendar updates by itself (Google can take up to a day to refresh; Apple and Outlook are quicker).
          </p>
          <div className="cal-buttons">
            <a className="btn secondary" href={links.google} target="_blank" rel="noreferrer">Google Calendar</a>
            <a className="btn secondary" href={links.apple}>Apple Calendar</a>
            <a className="btn secondary" href={links.outlook} target="_blank" rel="noreferrer">Outlook.com</a>
            <a className="btn secondary" href={links.outlookWork} target="_blank" rel="noreferrer">Outlook (work/school)</a>
          </div>
          <details className="small">
            <summary>Other calendar apps, or it didn't open?</summary>
            <p className="muted small">
              Copy this private link and use your calendar's "Subscribe" or "Add calendar from URL" option. Anyone with the link can see
              your bill names and amounts, so don't share it.
            </p>
            <div className="cal-link">
              <input readOnly value={url!} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar link" />
              <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(url!).then(() => setMsg("Link copied."))}>Copy</button>
            </div>
            <p className="small">
              <button className="link" disabled={busy} onClick={() => run(api.calendarCreate, "New link made. Calendars using the old link will stop updating; add the new one.")}>
                Make a new link
              </button>
              {" · "}
              <button className="link" disabled={busy} onClick={() => run(api.calendarOff, "Calendar link turned off.")}>Turn off</button>
              {" · "}
              <button className="link" onClick={download}>Download a one-time copy (.ics)</button>
            </p>
          </details>
          <p className="muted small">
            Google Calendar uses its own default notification for subscribed calendars; set it under that calendar's settings in Google
            Calendar.
          </p>
        </>
      ) : server ? (
        <>
          <p className="muted small">
            Get every bill on Google, Apple or Outlook Calendar, with reminders. It stays up to date as you add or change bills here.
          </p>
          <button className="btn" disabled={busy} onClick={() => run(api.calendarCreate)}>Set up calendar</button>
        </>
      ) : (
        <>
          <p className="muted small">
            Download your bills as a calendar file and open it with Google, Apple or Outlook Calendar. Each bill repeats monthly on its due
            date with a reminder. (Download again after you change bills.)
          </p>
          <button className="btn" onClick={download}>Download calendar file</button>
        </>
      )}
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}
