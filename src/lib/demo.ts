import type { Account, Transaction } from "./types";

/** A realistic 3-month history for a young adult who puts everything on a credit card. */
export function demoData(today = new Date()): { accounts: Account[]; transactions: Transaction[] } {
  const accounts: Account[] = [
    { id: "demo-chk", name: "Everyday Checking ••1234", type: "checking", source: "demo" },
    { id: "demo-sav", name: "High-Yield Savings ••8890", type: "savings", source: "demo" },
    { id: "demo-cc", name: "Rewards Visa ••4421", type: "credit", source: "demo" },
  ];
  let seed = 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const money = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100) / 100;

  const txs: Transaction[] = [];
  let n = 0;
  const add = (accountId: string, d: Date, description: string, amount: number, extra: Partial<Transaction> = {}) => {
    if (d > today) return;
    txs.push({ id: `demo-${n++}`, accountId, date: d.toISOString().slice(0, 10), description, amount, ...extra });
  };
  const day = (y: number, m: number, dd: number) => new Date(Date.UTC(y, m, dd));

  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
  for (let i = 0; i < 3; i++) {
    const y = start.getUTCFullYear();
    const m = start.getUTCMonth() + i;
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

    // Money in
    add("demo-chk", day(y, m, 1), "ACME CORP PAYROLL DIRECT DEP", -1450);
    add("demo-chk", day(y, m, 15), "ACME CORP PAYROLL DIRECT DEP", -1450);

    // Fixed bills from checking
    add("demo-chk", day(y, m, 2), "AVALON APARTMENTS RENT", 1100);
    add("demo-chk", day(y, m, 5), "TOYOTA FINANCIAL AUTO LOAN", 320);
    add("demo-chk", day(y, m, 8), "NELNET STUDENT LOAN", 180);
    add("demo-chk", day(y, m, 16), "Online Transfer to Savings ••8890", 100);
    add("demo-sav", day(y, m, 16), "Online Transfer from Checking ••1234", -100);

    // Everything else on the rewards card
    add("demo-cc", day(y, m, 3), "NETFLIX.COM", 15.49);
    add("demo-cc", day(y, m, 4), "SPOTIFY USA", 11.99);
    add("demo-cc", day(y, m, 9), "HULU 877-8244858", 17.99);
    add("demo-cc", day(y, m, 12), "VERIZON WIRELESS", 65);
    add("demo-cc", day(y, m, 20), "GEICO AUTO INSURANCE", 118);
    add("demo-cc", day(y, m, 22), "PLANET FITNESS", 24.99);
    for (let w = 0; w < 4; w++) {
      add("demo-cc", day(y, m, 3 + w * 7), pick(["TRADER JOE'S #552", "KROGER #0413", "ALDI 77210"]), money(45, 95));
      add("demo-cc", day(y, m, 6 + w * 7), pick(["SHELL OIL 5744", "CHEVRON 0091", "WAWA 8812"]), money(35, 55));
      add("demo-cc", day(y, m, 6 + w * 7), pick(["THE TIPSY TAVERN", "TOTAL WINE & MORE", "BREWDOG TAPROOM"]), money(22, 68));
      add("demo-cc", day(y, m, 7 + w * 7), pick(["CHIPOTLE 2231", "UBER EATS", "DOORDASH*TACO SPOT", "SUSHI KO"]), money(18, 48));
      for (let k = 0; k < 3; k++)
        add("demo-cc", day(y, m, Math.min(dim, 1 + w * 7 + k * 2)), pick(["STARBUCKS #1102", "DUNKIN #3345", "SWEETGREEN"]), money(5, 14));
    }
    add("demo-cc", day(y, m, 11), pick(["AMAZON.COM*MK2", "TARGET 00012", "NIKE.COM"]), money(40, 140));
    add("demo-cc", day(y, m, 24), pick(["SHEIN.COM", "ULTA BEAUTY", "BEST BUY 1190"]), money(35, 120));
    if (i === 1) add("demo-cc", day(y, m, 18), "TICKETMASTER", 142.5);
    add("demo-cc", day(y, m, 26), "CVS/PHARMACY #0231", money(8, 30));
  }

  // Pay the card from checking: the prior month's statement. Last full month only partially → interest.
  const byMonth = new Map<string, number>();
  for (const t of txs.filter((t) => t.accountId === "demo-cc" && t.amount > 0)) {
    const k = t.date.slice(0, 7);
    byMonth.set(k, (byMonth.get(k) ?? 0) + t.amount);
  }
  const months = [...byMonth.keys()].sort();
  months.forEach((mk, i) => {
    const [y, m] = mk.split("-").map(Number);
    const due = day(y, m, 10); // m is already next month (0-based)
    const full = Math.round(byMonth.get(mk)! * 100) / 100;
    const paid = i === 0 ? Math.round(full * 0.7 * 100) / 100 : full;
    add("demo-chk", due, "CHASE CREDIT CRD EPAY", paid);
    add("demo-cc", due, "PAYMENT - THANK YOU", -paid);
    if (i === 0) add("demo-cc", day(y, m, 28), "PURCHASE INTEREST CHARGE", Math.round((full - paid) * 0.2499 / 12 * 100) / 100);
  });

  return { accounts, transactions: txs };
}
