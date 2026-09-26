import { describe, expect, it } from "vitest";
import { guessMapping, looksNegative, parseCsv, parseDate, parseMoney, rowsToTransactions } from "./csv";

describe("csv import", () => {
  it("parses money and dates in common formats", () => {
    expect(parseMoney("$1,234.50")).toBe(1234.5);
    expect(parseMoney("(12.00)")).toBe(-12);
    expect(parseMoney("-$5")).toBe(-5);
    expect(parseDate("3/7/26")).toBe("2026-03-07");
    expect(parseDate("2026-03-07")).toBe("2026-03-07");
  });

  it("imports a Google Sheets style budget", () => {
    const { headers, rows } = parseCsv("Date,Item,Cost,Category\n9/1/2026,Rent,$1100,Rent\n9/2/2026,Kroger,$64.20,Buying food\n");
    const map = guessMapping(headers);
    expect(map).toMatchObject({ date: "Date", description: "Item", amount: "Cost", category: "Category" });
    expect(looksNegative(rows, map.amount)).toBe(false);
    const { txs } = rowsToTransactions(rows, map as never, "sheet", false);
    expect(txs.map((t) => t.amount)).toEqual([1100, 64.2]);
    expect(txs[1].importedCategory).toBe("Buying food");
  });

  it("flips bank exports where purchases are negative", () => {
    const { headers, rows } = parseCsv("Transaction Date,Description,Amount\n09/03/2026,STARBUCKS,-6.45\n09/04/2026,TARGET,-20\n09/05/2026,Payment Thank You,300\n");
    const map = guessMapping(headers);
    expect(looksNegative(rows, map.amount)).toBe(true);
    const { txs } = rowsToTransactions(rows, map as never, "cc", true);
    expect(txs.map((t) => t.amount)).toEqual([6.45, 20, -300]);
  });
});
