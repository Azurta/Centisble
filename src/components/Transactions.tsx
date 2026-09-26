import { useMemo, useState } from "react";
import { usd } from "../format";
import { CATEGORIES, categoryInfo } from "../lib/categories";
import type { CategoryId, ClassifiedTransaction, TxKind } from "../lib/types";
import type { AppData } from "../useAppData";

const KIND_LABEL: Record<TxKind, string> = {
  expense: "Spent",
  interest: "Interest/fee",
  refund: "Refund",
  income: "Income",
  transfer: "Not spending",
  savings: "Saved",
};

export function Transactions({ data, month }: { data: AppData; month: string }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategoryId | "">("");
  const [showTransfers, setShowTransfers] = useState(true);
  const [remember, setRemember] = useState(true);
  const accountName = useMemo(() => new Map(data.accounts.map((a) => [a.id, a.name])), [data.accounts]);

  const rows = data.classified.filter(
    (t) =>
      t.date.startsWith(month) &&
      (!cat || t.category === cat) &&
      (showTransfers || t.kind !== "transfer") &&
      (!q || `${t.description} ${t.merchant ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="stack">
      <AddManual onAdd={data.addManual} />
      <section className="card">
        <div className="filters">
          <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" />
          <select value={cat} onChange={(e) => setCat(e.target.value as CategoryId | "")} aria-label="Filter by category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={showTransfers} onChange={(e) => setShowTransfers(e.target.checked)} /> Show card payments & transfers</label>
          <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember category for merchant</label>
        </div>
        {!rows.length ? (
          <p className="muted empty">No transactions this month. Connect a bank or import a CSV on the Accounts tab.</p>
        ) : (
          <div className="table-wrap">
            <table className="tx">
              <thead>
                <tr><th>Date</th><th>Description</th><th>Category</th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {rows.map((t) => <Row key={t.id} t={t} data={data} remember={remember} account={accountName.get(t.accountId)} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ t, data, remember, account }: { t: ClassifiedTransaction; data: AppData; remember: boolean; account?: string }) {
  const excluded = t.kind === "transfer";
  return (
    <tr className={excluded ? "excluded" : ""}>
      <td className="nowrap">{t.date.slice(5).replace("-", "/")}</td>
      <td>
        <div className="desc">{t.merchant || t.description}{t.pending && <span className="pill">pending</span>}</div>
        <div className="muted small">
          <span className="mobile-date">{t.date.slice(5).replace("-", "/")} · </span>{account} · <span className={`kind ${t.kind}`} title={t.reason}>{KIND_LABEL[t.kind]}</span>
          {t.reason && <span className="reason"> — {t.reason}</span>}
        </div>
      </td>
      <td>
        <select
          value={t.category}
          aria-label="Category"
          onChange={(e) => data.setCategory(t, e.target.value as CategoryId, remember)}
        >
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
        {data.overrides.kind[t.id] || data.overrides.category[t.id] ? null : excluded ? (
          <button className="link small" onClick={() => data.setKind(t.id, "expense")}>Count as spending</button>
        ) : t.kind === "expense" ? (
          <button className="link small" onClick={() => data.setKind(t.id, "transfer")}>Not spending</button>
        ) : null}
        {data.overrides.kind[t.id] && <button className="link small" onClick={() => data.setKind(t.id, null)}>Undo</button>}
      </td>
      <td className={`num ${t.amount < 0 ? "in" : ""}`}>{t.amount < 0 ? "+" : ""}{usd(Math.abs(t.amount), true)}</td>
    </tr>
  );
}

function AddManual({ onAdd }: { onAdd: AppData["addManual"] }) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<CategoryId>("misc");
  if (!open) return <button className="btn secondary self-start" onClick={() => setOpen(true)}>+ Add cash purchase</button>;
  return (
    <form
      className="card filters"
      onSubmit={(e) => {
        e.preventDefault();
        const n = parseFloat(amount);
        if (!desc || !n) return;
        onAdd({ date, description: desc, amount: n, importedCategory: categoryInfo(category).label });
        setDesc("");
        setAmount("");
      }}
    >
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      <input placeholder="What was it?" value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="Description" />
      <input placeholder="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
      <select value={category} onChange={(e) => setCategory(e.target.value as CategoryId)} aria-label="Category">
        {CATEGORIES.filter((c) => c.bucket !== "none").map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
      </select>
      <button className="btn">Add</button>
      <button type="button" className="link" onClick={() => setOpen(false)}>Close</button>
    </form>
  );
}
