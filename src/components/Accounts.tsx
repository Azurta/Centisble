import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { api } from "../api";
import { parseBudgetWorkbook, readXlsx, type SheetImport } from "../lib/budgetSheet";
import { guessMapping, looksNegative, parseCsv, rowsToTransactions, type CsvMapping } from "../lib/csv";
import { saveJson } from "../lib/storage";
import type { AccountType } from "../lib/types";
import { usd, monthLabel } from "../format";
import { STATIC, type AppData } from "../useAppData";

export function Accounts({ data }: { data: AppData }) {
  return (
    <div className="grid">
      {STATIC ? <OnlineNote /> : <ConnectBank data={data} />}
      <section className="card">
        <h2>Your accounts</h2>
        {!data.accounts.length ? (
          <p className="muted">No accounts yet.</p>
        ) : (
          <ul className="list">
            {data.accounts.map((a) => (
              <li key={a.id}>
                <span>{a.type === "credit" ? "💳" : a.type === "savings" ? "🐖" : a.type === "loan" ? "🏦" : "💵"} {a.name} <span className="muted small">{a.type} · {a.source}</span></span>
                {a.source !== "plaid" && <button className="link small" onClick={() => data.removeAccount(a.id)}>Remove</button>}
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          {data.hasDemo ? (
            <button className="btn secondary" onClick={data.clearDemo}>Remove demo data</button>
          ) : (
            <button className="btn secondary" onClick={data.loadDemo}>Load demo data</button>
          )}
        </div>
      </section>
      <details className="card wide more">
        <summary>Other ways to add purchases</summary>
        <p className="muted small">
          Not needed once your bank is connected. Useful for cash, an account the bank connection doesn't support, or bringing in history.
        </p>
        <div className="stack">
          <ImportSheets data={data} />
          <ImportCsv data={data} />
        </div>
      </details>
    </div>
  );
}

function ConnectBank({ data }: { data: AppData }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const { status, serverError } = data;

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, meta) => {
      if (!publicToken) return;
      setMsg("Importing transactions…");
      try {
        const r = await api.exchange(publicToken, meta.institution?.name);
        setMsg(`Connected ${meta.institution?.name ?? "bank"} — ${r.changed} transactions imported.`);
        data.refresh();
      } catch (e) {
        setMsg(`Could not connect: ${(e as Error).message}`);
      }
    },
  });
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  return (
    <section className="card">
      <h2>Connect your bank & cards</h2>
      <p className="muted small">
        Link checking, savings and every credit card. New purchases appear here automatically — usually within minutes of swiping — and
        card payments are matched so they're never counted twice.
      </p>
      {serverError === "unauthorized" ? (
        <form className="filters" onSubmit={(e) => { e.preventDefault(); saveJson("azurta.token", token); data.refresh(); }}>
          <input type="password" placeholder="App token" value={token} onChange={(e) => setToken(e.target.value)} aria-label="App token" />
          <button className="btn">Unlock</button>
        </form>
      ) : serverError ? (
        <p className="callout">The sync server isn't running. Start it with <code>npm run dev</code> to link banks. CSV import and demo data work without it.</p>
      ) : status && !status.plaidConfigured ? (
        <p className="callout">
          Add your free Plaid keys to <code>.env</code> (see README) and restart the server to enable automatic bank sync.
        </p>
      ) : (
        <>
          <div className="row">
            <button className="btn" onClick={async () => {
              try { setLinkToken((await api.linkToken()).linkToken); } catch (e) { setMsg((e as Error).message); }
            }}>🔗 Connect an account</button>
            {!!status?.institutions.length && <button className="btn secondary" onClick={async () => { const r = await api.sync(); setMsg(`${r.changed} updates`); data.refresh(); }}>↻ Sync now</button>}
          </div>
          {status && (
            <p className="muted small">
              Plaid {status.env} · {status.webhook ? "instant updates via webhook" : "checking for new transactions every few minutes"}
              {data.lastUpdate && ` · last refreshed ${data.lastUpdate.toLocaleTimeString()}`}
            </p>
          )}
          <ul className="list">
            {status?.institutions.map((i) => (
              <li key={i.itemId}>
                <span>🏦 {i.institution ?? "Bank"} <span className="muted small">{i.lastSync ? `synced ${new Date(i.lastSync).toLocaleString()}` : ""}</span></span>
                <button className="link small" onClick={async () => { await api.unlink(i.itemId); data.refresh(); }}>Unlink</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}

function ImportCsv({ data }: { data: AppData }) {
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[]; name: string } | null>(null);
  const [map, setMap] = useState<Partial<CsvMapping>>({});
  const [negative, setNegative] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [type, setType] = useState<AccountType>("credit");
  const [msg, setMsg] = useState<string | null>(null);

  const onFile = async (f: File) => {
    const p = parseCsv(await f.text());
    const m = guessMapping(p.headers);
    setParsed({ ...p, name: f.name });
    setMap(m);
    setNegative(looksNegative(p.rows, m.amount));
    setAccountName(f.name.replace(/\.csv$/i, ""));
    setMsg(null);
  };

  const canImport = parsed && map.date && map.description && (map.amount || map.debit || map.credit);
  const doImport = () => {
    if (!parsed || !canImport) return;
    const id = `import-${accountName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const { txs, skipped } = rowsToTransactions(parsed.rows, map as CsvMapping, id, negative);
    data.importTransactions({ id, name: accountName, type, source: "import" }, txs);
    setMsg(`Imported ${txs.length} transactions${skipped ? ` (${skipped} rows skipped)` : ""}.`);
    setParsed(null);
  };

  const col = (key: keyof CsvMapping, label: string) => (
    <label>
      {label}
      <select value={map[key] ?? ""} onChange={(e) => setMap({ ...map, [key]: e.target.value || undefined })}>
        <option value="">—</option>
        {parsed!.headers.map((h) => <option key={h}>{h}</option>)}
      </select>
    </label>
  );

  return (
    <section className="card">
      <h2>Import a bank CSV</h2>
      <p className="muted small">
        Most banks let you download transactions as CSV. Import one file per account (checking, each credit card) and pick the account
        type so card payments can be matched.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} aria-label="CSV file" />
      {parsed && (
        <div className="import">
          <p className="small">{parsed.rows.length} rows found in {parsed.name}.</p>
          <div className="form-grid">
            <label>Account name<input value={accountName} onChange={(e) => setAccountName(e.target.value)} /></label>
            <label>
              Account type
              <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                <option value="credit">Credit card</option>
                <option value="checking">Checking / debit</option>
                <option value="savings">Savings</option>
                <option value="cash">Cash / budget sheet</option>
              </select>
            </label>
            {col("date", "Date column")}
            {col("description", "Description column")}
            {col("amount", "Amount column")}
            {!map.amount && col("debit", "Money out column")}
            {!map.amount && col("credit", "Money in column")}
            {col("category", "Category column (optional)")}
          </div>
          {map.amount && (
            <label className="check">
              <input type="checkbox" checked={negative} onChange={(e) => setNegative(e.target.checked)} />
              Purchases are negative numbers in this file (most bank exports)
            </label>
          )}
          <button className="btn" disabled={!canImport} onClick={doImport}>Import</button>
        </div>
      )}
      {msg && <p className="small good">{msg}</p>}
    </section>
  );
}

function OnlineNote() {
  return (
    <section className="card">
      <h2>Connect your bank</h2>
      <p className="small">
        This is the preview version. It can't connect to banks: a bank connection needs a secure server holding your private bank-link
        keys, and this page doesn't have one.
      </p>
      <p className="muted small">
        Once the full version is hosted, you connect each bank and card once and every purchase shows up on its own. Until then you can try
        everything with demo data, set up your categories and limits, and add purchases under “Other ways to add purchases”.
      </p>
    </section>
  );
}

function ImportSheets({ data }: { data: AppData }) {
  const [results, setResults] = useState<SheetImport[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onFiles = async (files: FileList) => {
    setBusy(true);
    setMsg(null);
    const out: SheetImport[] = [];
    for (const f of Array.from(files)) {
      try {
        out.push(parseBudgetWorkbook(f.name, await readXlsx(f)));
      } catch (e) {
        setMsg(`Couldn't read ${f.name}: ${(e as Error).message}`);
      }
    }
    setResults(out.sort((a, b) => a.month.localeCompare(b.month)));
    setBusy(false);
  };

  return (
    <section className="card">
      <h2>Import monthly budget sheets (.xlsx)</h2>
      <p className="muted small">
        In Google Sheets choose <em>File → Download → Microsoft Excel (.xlsx)</em>, then pick one or more months here. The app reads your
        income, every item, its category and what you paid with. Rows like “Capital one pay” or “Discover Debt” are recognised as credit
        card payments and <strong>not</strong> counted again. Re-importing a month replaces it.
      </p>
      <input type="file" multiple accept=".xlsx" onChange={(e) => e.target.files?.length && onFiles(e.target.files)} aria-label="Budget spreadsheets" />
      {busy && <p className="small">Reading…</p>}
      {!!results.length && (
        <>
          <div className="table-wrap">
            <table className="tx sheet-preview">
              <thead>
                <tr><th>Month</th><th className="num">Income</th><th className="num">Your sheet's expenses</th><th className="num">Card payments (not spending)</th><th className="num">Saved</th><th className="num">Real spending</th></tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.fileName}>
                    <td>{monthLabel(r.month)}<div className="muted small">{r.transactions.length} rows · {r.fileName}</div></td>
                    <td className="num">{usd(r.income, true)}</td>
                    <td className="num">{usd(r.expenses + r.cardPayments + r.saved, true)}</td>
                    <td className="num">{usd(r.cardPayments, true)}</td>
                    <td className="num">{usd(r.saved, true)}</td>
                    <td className="num"><strong>{usd(r.expenses, true)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn" onClick={() => {
              data.importSheetMonths(results);
              // Use the latest sheet's goals as budgets, unless budgets are already set up.
              const goals = results[results.length - 1].goals;
              if (!Object.keys(data.budgets).length && Object.keys(goals).length) data.setBudgets(goals);
              setMsg(`Imported ${results.length} month${results.length > 1 ? "s" : ""}. Check the Overview and pick a month at the top.`);
              setResults([]);
            }}>Import {results.length} month{results.length > 1 ? "s" : ""}</button>
            <button className="btn secondary" onClick={() => setResults([])}>Cancel</button>
          </div>
        </>
      )}
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}
