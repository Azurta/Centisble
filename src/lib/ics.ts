import { dueDate, type Bill } from "./bills";

/**
 * Bills as a calendar (.ics): each bill is one all-day event that repeats monthly on its due day,
 * with a reminder a few days before (9am) and on the day (9am). Google, Apple and Outlook all read this format.
 */

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 characters are folded onto continuation lines that start with a space (the format's rule). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n ");
}

const ymd = (d: string) => d.replace(/-/g, "");
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Monthly on the due day; a due day past the 28th lands on the month's last day when the month is shorter. */
export function monthlyRule(dueDay: number): string {
  const d = Math.min(Math.max(1, Math.round(dueDay)), 31);
  if (d <= 28) return `FREQ=MONTHLY;BYMONTHDAY=${d}`;
  const days = Array.from({ length: d - 27 }, (_, i) => 28 + i).join(",");
  return `FREQ=MONTHLY;BYMONTHDAY=${days};BYSETPOS=-1`;
}

function alarm(trigger: string, text: string): string[] {
  return ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escape(text)}`, `TRIGGER:${trigger}`, "END:VALARM"];
}

export function billsCalendar(bills: Bill[], opts: { appName: string; appUrl?: string; now?: Date }): string {
  const now = opts.now ?? new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const month = now.toISOString().slice(0, 7);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${opts.appName}//Bills//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(`${opts.appName} bills`)}`,
    "X-PUBLISHED-TTL:PT6H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  ];
  for (const b of bills) {
    const start = dueDate(b, month);
    const title = `${b.name} due - ${money(b.amount)}`;
    const notes = [
      b.autopay ? "Autopay is on: make sure there's enough in the account." : "Pay this bill by today.",
      opts.appUrl ? `See what's paid: ${opts.appUrl}` : "",
    ].filter(Boolean).join("\n");
    const early = b.remindDays ?? 3;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${b.id}@${opts.appName.toLowerCase()}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(start))}`,
      `RRULE:${monthlyRule(b.dueDay)}`,
      `SUMMARY:${escape(title)}`,
      `DESCRIPTION:${escape(notes)}`,
      "TRANSP:TRANSPARENT",
      // All-day events start at midnight: -PT63H is 9am three days before, PT9H is 9am on the day.
      ...(early > 0 ? alarm(`-PT${early * 24 - 9}H`, `${b.name} is due in ${early} day${early === 1 ? "" : "s"} (${money(b.amount)})`) : []),
      ...alarm("PT9H", `${b.name} is due today (${money(b.amount)})`),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Links that open each calendar's "subscribe to this calendar" screen with the feed filled in. */
export function calendarLinks(feedUrl: string, name: string) {
  const webcal = feedUrl.replace(/^https?:\/\//, "webcal://");
  return {
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    apple: webcal,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(name)}`,
    outlookWork: `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(name)}`,
  };
}
