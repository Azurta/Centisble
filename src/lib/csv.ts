import Papa from "papaparse";
import type { Transaction } from "./types";

export interface CsvMapping {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  category?: string;
}

const find = (headers: string[], re: RegExp) => headers.find((h) => re.test(h.trim().toLowerCase()));

export function guessMapping(headers: string[]): Partial<CsvMapping> {
  return {
    date: find(headers, /^(transaction\s*)?date$|posted|^date/),
    description: find(headers, /desc|merchant|payee|name|memo|item|where|details/),
    amount: find(headers, /^amount|amount$|cost|price|total|spent/),
    debit: find(headers, /debit|withdrawal|money out/),
    credit: find(headers, /credit(?!\s*card)|deposit|money in/),
    category: find(headers, /categor|type|bucket/),
  };
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  return { headers: res.meta.fields ?? [], rows: res.data };
}

export function parseMoney(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const s = v.trim();
  if (!s) return undefined;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-") || /-\s*\$/.test(s);
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(n)) return undefined;
  return neg ? -n : n;
}

export function parseDate(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return undefined;
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * Convert rows to transactions (positive = money out).
 * `purchasesNegative`: true for bank exports that show purchases as −$12.50.
 */
export function rowsToTransactions(
  rows: Record<string, string>[],
  map: CsvMapping,
  accountId: string,
  purchasesNegative: boolean,
): { txs: Transaction[]; skipped: number } {
  const txs: Transaction[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  for (const row of rows) {
    const date = parseDate(row[map.date]);
    const description = (row[map.description] ?? "").trim();
    let amount: number | undefined;
    if (map.amount) {
      amount = parseMoney(row[map.amount]);
      if (amount != null && purchasesNegative) amount = -amount;
    } else {
      const out = parseMoney(row[map.debit ?? ""]);
      const inn = parseMoney(row[map.credit ?? ""]);
      if (out != null || inn != null) amount = Math.abs(out ?? 0) - Math.abs(inn ?? 0);
    }
    if (!date || amount == null || amount === 0 || !description) {
      skipped++;
      continue;
    }
    const base = hash(`${accountId}|${date}|${description}|${amount.toFixed(2)}`);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    txs.push({
      id: `csv-${base}-${n}`,
      accountId,
      date,
      description,
      amount: Math.round(amount * 100) / 100,
      importedCategory: map.category ? row[map.category] : undefined,
    });
  }
  return { txs, skipped };
}

/** Guess whether purchases are negative: most bank exports are mostly negative numbers. */
export function looksNegative(rows: Record<string, string>[], amountCol: string | undefined): boolean {
  if (!amountCol) return false;
  const vals = rows.map((r) => parseMoney(r[amountCol])).filter((v): v is number => v != null);
  return vals.filter((v) => v < 0).length > vals.length / 2;
}
