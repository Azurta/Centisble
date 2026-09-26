import { describe, expect, it } from "vitest";
import { summarize } from "./analytics";
import { classifyAll } from "./classify";
import { setCategories, DEFAULT_CATEGORIES } from "./categories";
import { daysLeft, limitStatuses, newlyCrossed } from "./limits";
import type { Account, Transaction } from "./types";

const acct: Account[] = [{ id: "cc", name: "Card", type: "credit", source: "import" }];
const tx = (id: string, description: string, amount: number, date = "2026-09-10"): Transaction => ({ id, accountId: "cc", date, description, amount });

describe("limits", () => {
  it("counts days left in the month", () => {
    expect(daysLeft("2026-09", new Date("2026-09-26T12:00:00Z"))).toBe(5);
    expect(daysLeft("2026-08", new Date("2026-09-26T12:00:00Z"))).toBe(0);
  });

  it("warns near a limit and flags going over", () => {
    const s = summarize(classifyAll([tx("1", "CHIPOTLE", 170), tx("2", "TOTAL WINE", 130)], acct), "2026-09");
    const st = limitStatuses(s, { going_out: 200, alcohol: 100 }, 0.8, new Date("2026-09-26T12:00:00Z"));
    const eat = st.find((x) => x.id === "going_out")!;
    expect(eat.state).toBe("warn");
    expect(eat.perDay).toBeCloseTo(30 / 5);
    expect(st.find((x) => x.id === "alcohol")!.state).toBe("over");
    expect(newlyCrossed(st.map((x) => ({ ...x, state: "ok" as const })), st).map((x) => x.id)).toEqual(["going_out", "alcohol"]);
    expect(newlyCrossed(st, st)).toEqual([]);
  });

  it("sorts purchases into a custom category by keyword, and deleted categories fall back to Misc", () => {
    setCategories([...DEFAULT_CATEGORIES, { id: "coffee", label: "Coffee", emoji: "☕", bucket: "wants", keywords: ["starbucks", "dunkin"] }]);
    const c = classifyAll([tx("1", "STARBUCKS #1102", 6), tx("2", "SHELL OIL", 40)], acct);
    expect(c.map((t) => t.category)).toEqual(["coffee", "car"]);
    setCategories(DEFAULT_CATEGORIES.filter((x) => x.id !== "car"));
    expect(classifyAll([tx("2", "SHELL OIL", 40)], acct)[0].category).toBe("misc");
    setCategories(DEFAULT_CATEGORIES);
  });
});
