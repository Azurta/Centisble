import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { api } from "../api";
import { parseBudgetWorkbook, readXlsx, type SheetImport } from "../lib/budgetSheet";
import { guessMapping, looksNegative, parseCsv, rowsToTransactions, type CsvMapping } from "../lib/csv";
import { saveJson } from "../lib/storage";
import { isDebt } from "../lib/networth";
import { paymentFor, paymentSite, payoffPlan } from "../lib/payoff";
import type { Account, AccountType } from "../lib/types";
import { usd, monthLabel, pct } from "../format";
import { STATIC, type AppData } from "../useAppData";

/** `focus` is an element id such as "acct-<id>" (open that account) or "debts". */
export function Accounts({ data, focus }: { data: AppData; focus?: string }) {
  return (
    <div className="grid">
      {STATIC ? <OnlineNote /> : <ConnectBank data={data} />}
      <AddAccount data={data} />
      <YourAccounts data={data} focus={focus} />
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

const LINK_TOKEN_KEY = "centsible.linkToken";

/**
 * Opens Plaid Link. Banks that log you in on their own site (Chase, Capital One…) either use a pop-up, or,
 * when PLAID_REDIRECT_URI is set, send you back here with ?oauth_state_id=…; then Link is resumed with the same token.
 */
function usePlaid(data: AppData, setMsg: (m: string) => void) {
  const resuming = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("oauth_state_id");
  const [linkToken, setLinkToken] = useState<string | null>(() => {
    if (!resuming) return null;
    try {
      return sessionStorage.getItem(LINK_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri: resuming ? window.location.href : undefined,
    onSuccess: async (publicToken, meta) => {
      if (resuming) window.history.replaceState(null, "", window.location.pathname);
      if (!publicToken) return;
      setMsg("Importing transactions…");
      try {
        const r = await api.exchange(publicToken, meta.institution?.name);
        setMsg(`Connected ${meta.institution?.name ?? "bank"}: ${r.changed} transactions imported.`);
        data.refresh();
      } catch (e) {
        setMsg(`Could not connect: ${(e as Error).message}`);
      }
    },
    onExit: () => {
      if (resuming) window.history.replaceState(null, "", window.location.pathname);
    },
  });
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);
  const start = async () => {
    const t = (await api.linkToken()).linkToken;
    try {
      sessionStorage.setItem(LINK_TOKEN_KEY, t);
    } catch {
      /* redirect-style bank logins won't resume, pop-ups still work */
    }
    setLinkToken(t);
  };
  return start;
}

function ConnectBank({ data }: { data: AppData }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const { status, serverError } = data;
  const startLink = usePlaid(data, setMsg);

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
              try { await startLink(); } catch (e) { setMsg((e as Error).message); }
            }}>Connect an account</button>
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
                <span>{i.institution ?? "Bank"} <span className="muted small">{i.lastSync ? `synced ${new Date(i.lastSync).toLocaleString()}` : ""}</span></span>
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

const TYPE_LABEL: Record<AccountType, string> = {
  checking: "Checking / debit",
  savings: "Savings / investments",
  cash: "Cash",
  credit: "Credit card",
  loan: "Loan (student, car, personal…)",
};
const TYPE_SHORT: Record<AccountType, string> = { checking: "Checking", savings: "Savings", cash: "Cash", credit: "Credit card", loan: "Loan" };

function YourAccounts({ data, focus }: { data: AppData; focus?: string }) {
  const accounts = data.accounts.filter((a) => a.source !== "import");
  const assets = accounts.filter((a) => !isDebt(a));
  const debts = accounts.filter(isDebt);
  const owned = assets.filter((a) => !a.hidden).reduce((s, a) => s + (a.balance ?? 0), 0);
  const owed = debts.filter((a) => !a.hidden).reduce((s, a) => s + (a.balance ?? 0), 0);
  return (
    <section className="card wide">
      <div className="card-head">
        <h2>Your accounts</h2>
        {data.hasDemo ? (
          <button className="link small" onClick={data.clearDemo}>Remove demo data</button>
        ) : (
          <button className="link small" onClick={data.loadDemo}>Load demo data</button>
        )}
      </div>
      {!accounts.length && <p className="muted">No accounts yet. Connect your bank above, or add one by hand below.</p>}
      <div className="acct-columns">
        <div id="assets">
          <div className="acct-group-head"><span className="eyebrow">You own</span><span className="small good">{usd(owned)}</span></div>
          {assets.map((a) => <AccountEditor key={a.id} a={a} data={data} startOpen={focus === `acct-${a.id}`} />)}
          {!assets.length && <p className="muted small">Checking, savings, cash and investments show up here.</p>}
        </div>
        <div id="debts">
          <div className="acct-group-head"><span className="eyebrow">You owe</span><span className="small bad">{usd(owed)}</span></div>
          {debts.map((a) => <AccountEditor key={a.id} a={a} data={data} startOpen={focus === `acct-${a.id}`} />)}
          {!debts.length && <p className="muted small">Credit cards and loans show up here. Add student or car loans by hand if your bank connection doesn't include them.</p>}
        </div>
      </div>
      <div className="nw-total">
        <span>Net worth</span>
        <strong className={owned - owed < 0 ? "bad" : "good"}>{usd(owned - owed)}</strong>
      </div>
    </section>
  );
}

function AccountEditor({ a, data, startOpen }: { a: Account; data: AppData; startOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(startOpen));
  const bankOwned = a.source === "plaid";
  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return (
    <div id={`acct-${a.id}`} className={`acct-card ${a.hidden ? "off" : ""}`}>
      <button className="acct-line" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="acct-name">{a.name}<span className="acct-type">{TYPE_SHORT[a.type]}</span></span>
        <span className="acct-bal">{a.balance != null ? usd(a.balance, true) : <span className="muted">no balance</span>}</span>
      </button>
      <div className="muted small acct-meta">
        {a.apr != null && <span>{isDebt(a) ? `${a.apr}% APR` : `earns ${a.apr}%`}</span>}
        {a.type === "credit" && a.creditLimit ? <span>{pct((a.balance ?? 0) / a.creditLimit)} of {usd(a.creditLimit)} limit</span> : null}
        {a.type === "checking" && a.available != null && a.available !== a.balance && <span>{usd(a.available, true)} available</span>}
        {a.balanceAsOf && <span>updated {new Date(a.balanceAsOf).toLocaleDateString()}</span>}
        {a.hidden && <span>hidden</span>}
      </div>
      {open && (
        <div className="form-grid mt-s">
          <label>Name<input id={`acct-name-${a.id}`} value={a.name} onChange={(e) => data.updateAccount(a.id, { name: e.target.value })} /></label>
          {!bankOwned && (
            <label>
              {isDebt(a) ? "Amount owed ($)" : "Balance ($)"}
              <input id={`acct-bal-${a.id}`} inputMode="decimal" defaultValue={a.balance ?? ""} onBlur={(e) => data.updateAccount(a.id, { balance: num(e.target.value) })} />
            </label>
          )}
          <label>
            {isDebt(a) ? "Interest rate (APR %)" : "Interest earned (%)"}
            <input id={`acct-apr-${a.id}`} inputMode="decimal" placeholder={isDebt(a) ? "e.g. 24.99" : "optional"} defaultValue={a.apr ?? ""} onBlur={(e) => data.updateAccount(a.id, { apr: num(e.target.value) })} />
          </label>
          {!bankOwned && a.type === "credit" && (
            <label>
              Credit limit ($)
              <input id={`acct-limit-${a.id}`} inputMode="decimal" defaultValue={a.creditLimit ?? ""} onBlur={(e) => data.updateAccount(a.id, { creditLimit: num(e.target.value) })} />
            </label>
          )}
          <div className="row span-2">
            <label className="check">
              <input type="checkbox" checked={!a.hidden} onChange={(e) => data.updateAccount(a.id, { hidden: !e.target.checked })} /> Count in net worth
            </label>
            {a.source !== "plaid" && <button className="link small bad" onClick={() => data.removeAccount(a.id)}>Remove account</button>}
          </div>
          {bankOwned && <p className="muted small span-2">The balance updates from your bank automatically.</p>}
        </div>
      )}
      {open && isDebt(a) && <PayoffPanel a={a} data={data} />}
    </div>
  );
}

function AddAccount({ data }: { data: AppData }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("loan");
  const [balance, setBalance] = useState("");
  const [apr, setApr] = useState("");
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        const b = parseFloat(balance);
        if (!name.trim() || !Number.isFinite(b)) return;
        const r = parseFloat(apr);
        data.addManualAccount({ name: name.trim(), type, balance: b, apr: Number.isFinite(r) ? r : undefined });
        setName("");
        setBalance("");
        setApr("");
      }}
    >
      <h2>Add an account by hand</h2>
      <p className="muted small">For balances your bank connection doesn't cover: a student loan, a car loan, cash, a 401(k).</p>
      <div className="form-grid">
        <label>Name<input id="add-acct-name" placeholder="e.g. Student loans" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>
          Type
          <select id="add-acct-type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {(Object.keys(TYPE_LABEL) as AccountType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        <label>{type === "loan" || type === "credit" ? "Amount owed ($)" : "Balance ($)"}<input id="add-acct-balance" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} /></label>
        <label>{type === "loan" || type === "credit" ? "Interest rate (APR %)" : "Interest earned (%)"}<input id="add-acct-apr" inputMode="decimal" placeholder="optional" value={apr} onChange={(e) => setApr(e.target.value)} /></label>
      </div>
      <button className="btn mt-s" disabled={!name.trim() || !Number.isFinite(parseFloat(balance))}>Add account</button>
    </form>
  );
}

function PayoffPanel({ a, data }: { a: Account; data: AppData }) {
  const balance = a.balance ?? 0;
  const apr = a.apr;
  const site = paymentSite(a.name, a.payUrl);
  const payment = a.plannedPayment;
  const plan = payment && apr != null ? payoffPlan(balance, apr, payment) : undefined;
  const monthLabelOf = (ym: string) => monthLabel(ym);
  return (
    <div className="payoff">
      <div className="payoff-head">
        <h3>Pay it off</h3>
        {site ? (
          <a className="btn" href={site} target="_blank" rel="noreferrer">Make a payment ↗</a>
        ) : (
          <span className="muted small">Add a payment link below</span>
        )}
      </div>
      {(a.nextDue || a.minPayment != null || a.statementBalance != null) && (
        <dl className="due">
          {a.nextDue && <div><dt>Next due</dt><dd>{new Date(`${a.nextDue}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</dd></div>}
          {a.minPayment != null && <div><dt>Minimum</dt><dd>{usd(a.minPayment, true)}</dd></div>}
          {a.statementBalance != null && <div><dt>Statement balance</dt><dd>{usd(a.statementBalance, true)}</dd></div>}
        </dl>
      )}
      {a.type === "credit" && (
        <p className="small">
          Pay the full statement balance{a.statementBalance != null ? ` (${usd(a.statementBalance, true)})` : ""} by the due date and this card costs $0 in interest.
        </p>
      )}
      {apr == null ? (
        <p className="muted small">Add the interest rate above to see how long payoff takes and what it costs.</p>
      ) : balance > 0 ? (
        <>
          <div className="payoff-options">
            {[6, 12, 24, 36].filter((m) => a.type !== "credit" || m <= 24).map((m) => {
              const p = paymentFor(balance, apr, m);
              return (
                <button key={m} className={`option ${payment && Math.abs(payment - p) < 0.5 ? "on" : ""}`} onClick={() => data.updateAccount(a.id, { plannedPayment: Math.ceil(p) })}>
                  <span className="muted small">Debt-free in {m} mo</span>
                  <strong>{usd(Math.ceil(p))}/mo</strong>
                </button>
              );
            })}
          </div>
          <label className="payoff-input">
            My monthly payment ($)
            <input
              id={`pay-${a.id}`}
              key={payment}
              inputMode="decimal"
              defaultValue={payment ?? ""}
              placeholder="e.g. 300"
              onBlur={(e) => {
                const n = parseFloat(e.target.value);
                data.updateAccount(a.id, { plannedPayment: Number.isFinite(n) && n > 0 ? n : undefined });
              }}
            />
          </label>
          {payment ? (
            plan ? (
              <p className="small">
                Paid off in <strong>{plan.months} month{plan.months === 1 ? "" : "s"}</strong> ({monthLabelOf(plan.paidOffBy)}), with{" "}
                <strong>{usd(plan.totalInterest)}</strong> in interest along the way.
              </p>
            ) : (
              <p className="small bad">{usd(payment)}/mo doesn't cover the interest ({usd((balance * apr) / 1200, true)}/mo). The balance would keep growing.</p>
            )
          ) : null}
        </>
      ) : (
        <p className="small good">Paid off.</p>
      )}
      <label className="payoff-input">
        Payment website or app link
        <input
          id={`payurl-${a.id}`}
          placeholder={site ?? "e.g. mohela.studentaid.gov"}
          defaultValue={a.payUrl ?? ""}
          onBlur={(e) => data.updateAccount(a.id, { payUrl: e.target.value.trim() || undefined })}
        />
      </label>
    </div>
  );
}
