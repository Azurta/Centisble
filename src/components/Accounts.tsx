import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { api } from "../api";
import { guessMapping, looksNegative, parseCsv, rowsToTransactions, type CsvMapping } from "../lib/csv";
import { saveJson } from "../lib/storage";
import type { AccountType } from "../lib/types";
import type { AppData } from "../useAppData";

export function Accounts({ data }: { data: AppData }) {
  return (
    <div className="grid">
      <ConnectBank data={data} />
      <ImportCsv data={data} />
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
      <h2>Import from Google Sheets or a bank CSV</h2>
      <p className="muted small">
        In Google Sheets: <em>File → Download → Comma-separated values (.csv)</em>. Import one file per account (e.g. one for your checking,
        one for each credit card) so card payments can be matched.
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
