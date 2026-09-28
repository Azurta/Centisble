/**
 * Bills: things you pay every month (rent, phone, car insurance, card payments).
 * Each month we work out its due date, whether a matching payment already happened, and how soon it's due.
 */
import { findRecurring, monthOf } from "./analytics";
import { merchantKey } from "./classify";
import type { Account, CategoryId, ClassifiedTransaction } from "./types";

export interface Bill {
  id: string;
  name: string;
  /** Expected amount (for a card, the minimum payment). */
  amount: number;
  /** Day of the month it's due (1–31; clamped to the month's length). */
  dueDay: number;
  category?: CategoryId;
  /** Text that identifies the payment in your transactions, e.g. "verizon". Defaults to the name. */
  match?: string;
  /** For a card or loan: its account. Paid means a payment arrived on that account this month. */
  accountId?: string;
  /** Remind this many days before the due date. */
  remindDays?: number;
  autopay?: boolean;
}

export type BillStatus = "paid" | "overdue" | "due-today" | "due-soon" | "upcoming";

export interface BillOccurrence {
  bill: Bill;
  /** YYYY-MM-DD due date in the month asked for. */
  date: string;
  status: BillStatus;
  daysUntil: number;
  payment?: ClassifiedTransaction;
}

const DAY = 86_400_000;
const utc = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);

export function dueDate(bill: Pick<Bill, "dueDay">, month: string): string {
  const [y, m] = month.split("-").map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(Math.max(1, bill.dueDay), dim)).padStart(2, "0")}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The transaction that paid this bill in `month`, if any. */
export function findPayment(bill: Bill, txs: ClassifiedTransaction[], month: string): ClassifiedTransaction | undefined {
  const inMonth = txs.filter((t) => monthOf(t.date) === month);
  if (bill.accountId) {
    // A card/loan payment shows up on that account as money in.
    return inMonth.filter((t) => t.accountId === bill.accountId && t.amount < 0 && t.kind !== "refund").sort((a, b) => a.date.localeCompare(b.date))[0];
  }
  const needle = norm(bill.match || bill.name);
  if (!needle) return undefined;
  const candidates = inMonth.filter((t) => {
    if (t.amount <= 0) return false;
    const hay = `${norm(t.description)} ${norm(t.merchant ?? "")} ${merchantKey(t)}`;
    return hay.includes(needle);
  });
  if (!candidates.length) return undefined;
  // Prefer the charge closest to the expected amount; allow the bill to vary (utilities do).
  const best = candidates.sort((a, b) => Math.abs(a.amount - bill.amount) - Math.abs(b.amount - bill.amount))[0];
  return bill.amount > 0 && Math.abs(best.amount - bill.amount) > Math.max(5, bill.amount * 0.5) ? undefined : best;
}

export function billsForMonth(bills: Bill[], txs: ClassifiedTransaction[], month: string, today = new Date()): BillOccurrence[] {
  const todayYmd = today.toISOString().slice(0, 10);
  return bills
    .map((bill) => {
      const date = dueDate(bill, month);
      const payment = findPayment(bill, txs, month);
      const daysUntil = Math.round((utc(date) - utc(todayYmd)) / DAY);
      const soon = bill.remindDays ?? 3;
      const status: BillStatus = payment
        ? "paid"
        : daysUntil < 0
          ? "overdue"
          : daysUntil === 0
            ? "due-today"
            : daysUntil <= soon
              ? "due-soon"
              : "upcoming";
      return { bill, date, status, daysUntil, payment };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface BillTotals {
  total: number;
  paid: number;
  left: number;
}

export function billTotals(occ: BillOccurrence[]): BillTotals {
  const total = occ.reduce((s, o) => s + o.bill.amount, 0);
  const paid = occ.filter((o) => o.status === "paid").reduce((s, o) => s + (o.payment ? Math.abs(o.payment.amount) : o.bill.amount), 0);
  return { total, paid, left: Math.max(0, occ.filter((o) => o.status !== "paid").reduce((s, o) => s + o.bill.amount, 0)) };
}

export type BillSuggestion = Omit<Bill, "id"> & { why: string };

/** "AVALON APARTMENTS RENT" → "Avalon Apartments Rent"; drops trailing reference numbers like "877-8244858". */
export function tidyName(raw: string): string {
  const cleaned = raw.replace(/[#*]?\s*[\d-]{4,}\s*$/, "").trim() || raw.trim();
  if (cleaned !== cleaned.toUpperCase()) return cleaned;
  return cleaned.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\.Com\b/, ".com");
}

/** Bills we can suggest from your history (repeating charges) and your bank (card/loan due dates). */
export function suggestBills(txs: ClassifiedTransaction[], accounts: Account[], existing: Bill[], month: string): BillSuggestion[] {
  const taken = new Set(existing.map((b) => b.accountId ?? norm(b.match || b.name)));
  const out: BillSuggestion[] = [];
  for (const a of accounts) {
    if ((a.type !== "credit" && a.type !== "loan") || a.hidden || !a.nextDue || taken.has(a.id)) continue;
    out.push({
      name: `${a.name} payment`,
      amount: a.minPayment ?? a.statementBalance ?? 0,
      dueDay: Number(a.nextDue.slice(8, 10)),
      accountId: a.id,
      category: "debt",
      why: "Due date from your bank",
    });
  }
  for (const r of findRecurring(txs, month, { includeFixed: true })) {
    const match = norm(r.label);
    if (!match || taken.has(match) || out.some((o) => o.match === match)) continue;
    out.push({
      name: tidyName(r.label),
      amount: Math.round(r.monthly * 100) / 100,
      dueDay: Number(r.lastDate.slice(8, 10)),
      match,
      category: r.category,
      why: `Charged every month (${r.months} months in a row)`,
    });
  }
  return out;
}
