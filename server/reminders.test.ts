import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent: { title: string; body: string }[] = [];
vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }),
    sendNotification: vi.fn(async (_sub: unknown, payload: string) => {
      sent.push(JSON.parse(payload));
    }),
  },
}));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "centsible-rem-"));
beforeAll(() => {
  process.env.DATA_DIR = dir;
  process.env.DATA_KEY = "k";
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("bill reminders", () => {
  it("sends each reminder once, in the person's daytime, and skips paid bills", async () => {
    const { store, userData } = await import("./store");
    const { sendBillReminders } = await import("./reminders");
    store.push.push({ userId: "u1", endpoint: "https://push.example/1", keys: { p256dh: "a", auth: "b" }, createdAt: "" });
    const ud = userData("u1");
    ud.accounts = [{ id: "chk", name: "Checking", type: "checking", source: "plaid" }];
    ud.transactions = [{ id: "t1", accountId: "chk", date: "2026-10-01", description: "AVALON APARTMENTS RENT", amount: 1100 }];
    ud.settings = {
      tz: "America/Chicago",
      bills: [
        { id: "rent", name: "Avalon apartments", amount: 1100, dueDay: 1 },
        { id: "phone", name: "Verizon", amount: 65, dueDay: 12, remindDays: 3 },
        { id: "ins", name: "Geico", amount: 118, dueDay: 10 },
      ],
    };

    // Oct 9, 3am Chicago: too early, nothing sent.
    vi.setSystemTime(new Date("2026-10-09T08:00:00Z"));
    expect(await sendBillReminders()).toBe(0);

    // Oct 9, 10am Chicago: Verizon due in 3 days, Geico due tomorrow; rent was paid.
    vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
    expect(await sendBillReminders()).toBe(2);
    expect(sent.map((s) => s.title).sort()).toEqual(["Geico due in 1 day", "Verizon due in 3 days"]);

    // Same day again: nothing new.
    expect(await sendBillReminders()).toBe(0);

    // Oct 10: Geico due today. Oct 11: Geico unpaid since yesterday.
    vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
    await sendBillReminders();
    vi.setSystemTime(new Date("2026-10-11T15:00:00Z"));
    await sendBillReminders();
    expect(sent.map((s) => s.title)).toContain("Geico is due today");
    expect(sent.map((s) => s.title)).toContain("Geico looks unpaid");
    expect(sent.some((s) => s.title.startsWith("Avalon"))).toBe(false);
  });
});
