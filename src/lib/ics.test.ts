import { describe, expect, it } from "vitest";
import { billsCalendar, calendarLinks, monthlyRule } from "./ics";

describe("bills calendar", () => {
  const now = new Date("2026-09-30T15:00:00Z");
  const ics = billsCalendar(
    [
      { id: "bill-rent", name: "Rent", amount: 1100, dueDay: 1, remindDays: 3 },
      { id: "bill-phone", name: "Verizon, phone; family plan", amount: 64.5, dueDay: 31, remindDays: 0, autopay: true },
    ],
    { appName: "Centsible", appUrl: "https://example.com", now },
  );
  it("makes one repeating all-day event per bill", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260901\r\nDTEND;VALUE=DATE:20260902\r\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1");
    expect(ics).toContain("SUMMARY:Rent due - $1\\,100");
  });
  it("reminds 3 days before at 9am and on the day, and escapes text", () => {
    expect(ics).toContain("TRIGGER:-PT63H");
    expect(ics.match(/TRIGGER:PT9H/g)).toHaveLength(2);
    expect(ics).toContain("SUMMARY:Verizon\\, phone\\; family plan due - $64.50");
  });
  it("puts a 31st due day on the last day of shorter months", () => {
    expect(monthlyRule(31)).toBe("FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1");
    expect(monthlyRule(29)).toBe("FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260930");
  });
  it("keeps every line within the format's length limit", () => {
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });
  it("builds subscribe links for each calendar", () => {
    const l = calendarLinks("https://example.com/api/calendar/abc.ics", "Centsible bills");
    expect(l.apple).toBe("webcal://example.com/api/calendar/abc.ics");
    expect(l.google).toContain("cid=webcal%3A%2F%2Fexample.com");
    expect(l.outlook).toContain("addfromweb?url=https%3A%2F%2Fexample.com");
  });
});
