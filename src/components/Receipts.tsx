import { useRef, useState } from "react";
import { api, type ScannedReceipt } from "../api";
import { usd } from "../format";
import { allCategories, matchCategoryLabel } from "../lib/categories";
import type { AppData } from "../useAppData";

/** Claude reads images up to about 1568 px on the long side; bigger photos only cost more to send. */
const MAX_SIDE = 1568;

/** Shrinks a phone photo to a JPEG the server can send in one go (also turns iPhone HEIC photos into JPEG). */
async function photoToJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Snap a receipt; the app fills in the purchase for you to check and save. */
export function ReceiptScanner({ data }: { data: AppData }) {
  const info = data.status?.receipts;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<(ScannedReceipt & { categoryId: string; paidCash: boolean }) | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  if (!info?.enabled) return null;

  const left = info.limit == null ? null : Math.max(0, info.limit - info.used);
  const bankLinked = data.accounts.some((a) => a.source === "plaid");
  const spending = allCategories().filter((c) => c.bucket !== "none");

  const scan = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const image = await photoToJpeg(file);
      const { receipt } = await api.scanReceipt({ image, mediaType: "image/jpeg", categories: spending.map((c) => c.label), today: localToday() });
      setDraft({ ...receipt, categoryId: matchCategoryLabel(receipt.category) ?? "misc", paidCash: receipt.payment === "cash" });
      data.refresh();
    } catch (e) {
      setError((e as Error).message || "Couldn't read that photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const save = () => {
    if (!draft) return;
    const label = spending.find((c) => c.id === draft.categoryId)?.label ?? "Misc";
    data.addManual({ date: draft.date, description: draft.merchant, amount: draft.total, importedCategory: label }, draft.paidCash);
    setSaved(`${draft.merchant}, ${usd(draft.total, true)}, saved${draft.paidCash && data.wallet ? " and taken out of your cash" : ""}.`);
    setDraft(null);
  };

  return (
    <section className="card receipt" id="receipt">
      <div className="card-head">
        <h2>Scan a receipt</h2>
        {left != null && <span className="muted small">{left} of {info.limit} scans left this month</span>}
      </div>
      {!draft && (
        <>
          <p className="muted small">Take a photo of a receipt and the store, date, total and category are filled in for you to check.</p>
          <input
            ref={input}
            id="receipt-photo"
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => scan(e.target.files?.[0])}
          />
          <button className="btn" disabled={busy || left === 0} onClick={() => input.current?.click()}>
            {busy ? "Reading the receipt…" : "Take or choose a photo"}
          </button>
        </>
      )}
      {draft && (
        <form className="form-grid receipt-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label>Store<input id="receipt-merchant" value={draft.merchant} onChange={(e) => setDraft({ ...draft, merchant: e.target.value })} /></label>
          <label>Date<input id="receipt-date" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
          <label>
            Total ($)
            <input id="receipt-total" inputMode="decimal" value={draft.total} onChange={(e) => setDraft({ ...draft, total: Number(e.target.value) || 0 })} />
            {draft.tax > 0 && <span className="muted small">Includes {usd(draft.tax, true)} tax</span>}
          </label>
          <label>
            Category
            <select id="receipt-category" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
              {spending.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label>
            Paid with
            <select id="receipt-paid" value={draft.paidCash ? "cash" : "card"} onChange={(e) => setDraft({ ...draft, paidCash: e.target.value === "cash" })}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </select>
          </label>
          {draft.items.length > 0 && (
            <details className="small">
              <summary>{draft.items.length} item{draft.items.length === 1 ? "" : "s"} on the receipt</summary>
              <ul className="list">
                {draft.items.map((it, i) => <li key={i}><span>{it.name}</span><span>{usd(it.amount, true)}</span></li>)}
              </ul>
            </details>
          )}
          {!draft.paidCash && bankLinked && (
            <p className="small warn-text">
              Card purchases come in from your bank automatically, so saving this too would count it twice. Save it only if this card isn't linked.
            </p>
          )}
          <div className="row-gap">
            <button className="btn" disabled={!(draft.total > 0)}>{!draft.paidCash && bankLinked ? "Save anyway" : "Save purchase"}</button>
            <button type="button" className="link" onClick={() => setDraft(null)}>Discard</button>
          </div>
        </form>
      )}
      {error && <p className="small bad">{error}</p>}
      {saved && <p className="small good">{saved}</p>}
    </section>
  );
}
