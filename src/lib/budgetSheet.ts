/**
 * Reads hand-made monthly budget spreadsheets (Google Sheets → .xlsx), e.g.
 *
 *   Income block:   | Income |        |        Expense table: | Date | Item | Quantity | Price | Category | Payment | Notes | Total |
 *                   | Actual | =sum() |
 *                   | Job    | 1602   |
 *
 * plus per-category tabs ("Food", "Takeout", "ALC"…) that have Item/Quantity/Price/Total but no category column.
 * The sheet already says what each row is, so every row gets a `sheetKind` and the classifier trusts it.
 */
import { matchCategoryLabel } from "./categories";
import { parseDate } from "./csv";
import type { Budgets, CategoryId, Transaction, TxKind } from "./types";

export type Cell = string | number | boolean | Date | null;
export interface SheetGrid {
  name: string;
  rows: Cell[][];
}

export interface SheetImport {
  fileName: string;
  month: string; // YYYY-MM
  transactions: Transaction[];
  income: number;
  expenses: number;
  cardPayments: number;
  saved: number;
  tables: string[];
  /** Monthly goals from the sheet's summary table (Category | Actual | Goal). */
  goals: Budgets;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const CARD_ISSUERS =
  /capital\s*one|cap\s*one|discover|chase|amex|american\s*express|citi|apple\s*card|wells\s*fargo|bank\s*of\s*america|\bboa\b|synchrony|barclay|credit\s*one|mission\s*lane|credit\s*card|\bcc\b/i;
const SECTION_LABEL = /^(savings|debt|dept|goal|expenses)$/i;

const text = (c: Cell) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c)).trim();
const num = (c: Cell): number | undefined => {
  if (typeof c === "number") return Number.isFinite(c) ? c : undefined;
  if (typeof c === "string" && /^\s*\$?-?[\d,]+(\.\d+)?\s*$/.test(c)) return parseFloat(c.replace(/[$,\s]/g, ""));
  return undefined;
};

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function cellDate(c: Cell): string | undefined {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? undefined : c.toISOString().slice(0, 10);
  if (typeof c === "string" && /\d/.test(c)) return parseDate(c.length > 10 && /T\d\d:/.test(c) ? c.slice(0, 10) : c);
  return undefined;
}

/** "July_Monthly_Budget.xlsx" → 7. */
export function monthFromName(name: string): number | undefined {
  const l = name.toLowerCase();
  const i = MONTHS.findIndex((m) => new RegExp(`(^|[^a-z])${m}`).test(l));
  return i >= 0 ? i + 1 : undefined;
}

function inferMonth(fileName: string, sheets: SheetGrid[], today: Date): string {
  const dates: string[] = [];
  for (const s of sheets) for (const r of s.rows) for (const c of r) {
    const d = c instanceof Date ? cellDate(c) : undefined;
    if (d) dates.push(d);
  }
  const fromName = monthFromName(fileName) ?? monthFromName(sheets[0]?.name ?? "");
  if (fromName) {
    const mm = String(fromName).padStart(2, "0");
    const years = dates.filter((d) => d.slice(5, 7) === mm).map((d) => d.slice(0, 4));
    if (years.length) return `${mode(years)}-${mm}`;
    // Most recent occurrence of that month that isn't in the future.
    const y = today.getUTCFullYear() - (fromName > today.getUTCMonth() + 1 ? 1 : 0);
    return `${y}-${mm}`;
  }
  if (dates.length) return mode(dates.map((d) => d.slice(0, 7)));
  return today.toISOString().slice(0, 7);
}

function mode(xs: string[]): string {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

interface Columns {
  date?: number; item: number; qty?: number; price?: number; category?: number; payment?: number; notes?: number; total?: number;
}

function findHeader(row: Cell[]): Columns | undefined {
  const cols = row.map((c) => text(c).toLowerCase());
  const item = cols.findIndex((c) => c === "item" || c === "items" || c === "description" || c === "expense");
  if (item < 0) return undefined;
  const idx = (re: RegExp) => {
    const i = cols.findIndex((c, j) => j !== item && re.test(c));
    return i >= 0 ? i : undefined;
  };
  const h: Columns = {
    item,
    date: idx(/^date$/),
    qty: idx(/^(qty|quantity)$/),
    price: idx(/price|cost|amount/),
    category: idx(/cat(e|er)gory|^type$/),
    payment: idx(/payment|paid|card|method/),
    notes: idx(/^notes?$/),
    total: idx(/^total$/),
  };
  return h.price != null || h.total != null ? h : undefined;
}

function incomeRows(sheet: SheetGrid): { label: string; amount: number; row: number }[] {
  const out: { label: string; amount: number; row: number }[] = [];
  // The block starts at an "Income" label followed within a few rows by "Actual" (the summary table also says "Income").
  const isActual = (i: number) => /^actual$/i.test(text(sheet.rows[i]?.[0] ?? null));
  const headerRow = sheet.rows.findIndex(
    (r, i) => /^income$/i.test(text(r[0])) && [1, 2, 3].some((d) => isActual(i + d)),
  );
  if (headerRow < 0) return out;
  const actualRow = [1, 2, 3].map((d) => headerRow + d).find(isActual)!;
  for (let i = actualRow + 1; i < sheet.rows.length; i++) {
    const label = text(sheet.rows[i][0]);
    if (SECTION_LABEL.test(label)) break;
    const amount = num(sheet.rows[i][1] ?? null);
    if (label && amount && amount > 0) out.push({ label, amount, row: i });
  }
  return out;
}

function summaryGoals(sheet: SheetGrid): Budgets {
  const goals: Budgets = {};
  for (let r = 0; r < sheet.rows.length; r++) {
    const cols = sheet.rows[r].map((c) => text(c).toLowerCase());
    const cat = cols.indexOf("category");
    const goal = cols.indexOf("goal");
    if (cat < 0 || goal < 0 || !cols.includes("actual")) continue;
    for (let i = r + 1; i < sheet.rows.length; i++) {
      const label = text(sheet.rows[i][cat] ?? null);
      if (!label || /net total|true actual/i.test(label)) break;
      const id = matchCategoryLabel(label);
      const amount = num(sheet.rows[i][goal] ?? null);
      const skip: (CategoryId | undefined)[] = [undefined, "income", "savings", "transfer"];
      if (!skip.includes(id) && amount && amount > 0 && !/^expenses$/i.test(label)) goals[id!] = (goals[id!] ?? 0) + amount;
    }
    break;
  }
  return goals;
}

export function parseBudgetWorkbook(fileName: string, sheets: SheetGrid[], today = new Date()): SheetImport {
  const month = inferMonth(fileName, sheets, today);
  const txs: Transaction[] = [];
  const tables: string[] = [];
  const start = `${month}-01`;
  const id = (sheet: string, row: number, what: string, amount: number) =>
    `sheet-${month}-${hash(`${sheet}|${row}|${what}|${amount.toFixed(2)}`)}`;

  for (const sheet of sheets) {
    // Income block (label in column A, amount in column B).
    for (const inc of incomeRows(sheet)) {
      txs.push({
        id: id(sheet.name, inc.row, inc.label, inc.amount), accountId: "sheet-budget", date: start,
        description: inc.label, amount: -inc.amount, sheetKind: "income",
      });
    }

    // Expense tables.
    const title = text(sheet.rows[0]?.find((c) => text(c)) ?? null) || sheet.name;
    for (let r = 0; r < sheet.rows.length; r++) {
      const h = findHeader(sheet.rows[r]);
      if (!h) continue;
      tables.push(h.category == null ? `${sheet.name} (${title})` : sheet.name);
      let lastDate = start;
      let end = r + 1;
      for (; end < sheet.rows.length; end++) {
        const row = sheet.rows[end];
        if (findHeader(row)) break; // another table starts
        const item = text(row[h.item] ?? null);
        if (!item || /total$/i.test(item)) continue;
        const qty = h.qty != null ? num(row[h.qty] ?? null) : undefined;
        const price = h.price != null ? num(row[h.price] ?? null) : undefined;
        const total = h.total != null ? num(row[h.total] ?? null) : undefined;
        const amount = total && total > 0 ? total : price != null ? price * (qty ?? 1) : undefined;
        if (!amount || amount <= 0) continue;

        const rawDate = h.date != null ? cellDate(row[h.date] ?? null) : undefined;
        const date = rawDate && rawDate.startsWith(month) ? rawDate : lastDate;
        lastDate = date;

        const category = h.category != null ? text(row[h.category] ?? null) : title;
        const paidWith = h.payment != null ? text(row[h.payment] ?? null) || undefined : undefined;
        const cat = matchCategoryLabel(category);
        let kind: TxKind = "expense";
        if (cat === "savings") kind = "savings";
        else if (cat === "income") kind = "income";
        else if (/credit\s*card/i.test(category) || (cat === "debt" && CARD_ISSUERS.test(item))) kind = "transfer";

        txs.push({
          id: id(sheet.name, end, item, amount),
          accountId: "sheet-budget",
          date,
          description: item,
          amount: kind === "income" ? -amount : Math.round(amount * 100) / 100,
          importedCategory: category || undefined,
          sheetKind: kind,
          paidWith,
        });
      }
      r = end - 1;
    }
  }

  const sum = (k: TxKind) => txs.filter((t) => t.sheetKind === k).reduce((a, t) => a + Math.abs(t.amount), 0);
  const goals = sheets.reduce<Budgets>((g, sh) => ({ ...summaryGoals(sh), ...g }), {});
  return { fileName, month, goals, transactions: txs, income: sum("income"), expenses: sum("expense"), cardPayments: sum("transfer"), saved: sum("savings"), tables };
}

/** Load an .xlsx file in the browser (exceljs is loaded on demand — it's large). */
export async function readXlsx(file: File): Promise<SheetGrid[]> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return workbookToGrids(wb);
}

type Workbook = import("exceljs").Workbook;
export function workbookToGrids(wb: Workbook): SheetGrid[] {
  const sheets: SheetGrid[] = [];
  wb.eachSheet((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const cells: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        cells[c - 1] = toCell(cell.value);
      });
      rows[r - 1] = cells;
    });
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    sheets.push({ name: ws.name, rows });
  });
  return sheets;
}

function toCell(v: unknown): Cell {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return toCell(o.result);
    if ("formula" in o || "sharedFormula" in o) return null; // formula with no cached value
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return toCell(o.text);
    if ("error" in o) return null;
  }
  return null;
}
