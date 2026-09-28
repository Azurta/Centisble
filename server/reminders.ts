/**
 * Bill reminders by phone notification: a few days before (as set per bill), on the due date, and the day after if still unpaid.
 * Checked every hour; only sent between 9am and 9pm in the person's own time zone, and each one only once.
 */
import { billsForMonth } from "../src/lib/bills";
import { classifiedFor, notify } from "./push";
import { save, store } from "./store";

function localNow(tz: string | undefined): { ymd: string; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .reduce<Record<string, string>>((o, p) => ((o[p.type] = p.value), o), {});
    return { ymd: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
  } catch {
    const d = new Date();
    return { ymd: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
  }
}

const money = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`;

export async function sendBillReminders(): Promise<number> {
  let sent = 0;
  for (const [userId, ud] of Object.entries(store.data)) {
    if (!store.push.some((p) => p.userId === userId)) continue;
    const { settings, txs } = classifiedFor(ud);
    if (!settings.bills?.length) continue;
    const { ymd, hour } = localNow(settings.tz);
    if (hour < 9 || hour >= 21) continue;
    const month = ymd.slice(0, 7);
    const done = new Set(ud.billReminders ?? []);
    for (const o of billsForMonth(settings.bills, txs, month, new Date(`${ymd}T12:00:00Z`))) {
      if (o.status === "paid") continue;
      const b = o.bill;
      const stage = o.daysUntil === 0 ? "today" : o.daysUntil === -1 ? "late" : o.daysUntil > 0 && o.daysUntil <= (b.remindDays ?? 3) ? "soon" : null;
      if (!stage) continue;
      const key = `${b.id}:${month}:${stage}`;
      if (done.has(key)) continue;
      const auto = b.autopay ? " (autopay: make sure there's enough in the account)" : "";
      if (stage === "soon") await notify(userId, `${b.name} due in ${o.daysUntil} day${o.daysUntil === 1 ? "" : "s"}`, `${money(b.amount)} on ${o.date.slice(5).replace("-", "/")}${auto}.`, "/");
      else if (stage === "today") await notify(userId, `${b.name} is due today`, `${money(b.amount)}${auto}.`, "/");
      else await notify(userId, `${b.name} looks unpaid`, `It was due yesterday (${money(b.amount)}). If you already paid, it'll clear once the payment shows up.`, "/");
      done.add(key);
      sent++;
    }
    // Keep only this month's and last month's keys.
    const keep = [month, new Date(Date.parse(`${month}-01T00:00:00Z`) - 86_400_000).toISOString().slice(0, 7)];
    ud.billReminders = [...done].filter((k) => keep.some((m) => k.includes(`:${m}:`)));
  }
  if (sent) save();
  return sent;
}
