import "dotenv/config";
import express from "express";
import path from "node:path";
import type { Response } from "express";
import { createLinkToken, exchangePublicToken, plaidConfigured, syncAll, syncItem } from "./plaid";
import { db, save } from "./store";

const app = express();
app.use(express.json());

/*
 * Optional shared secret. Set APP_TOKEN whenever the server is reachable from the internet
 * (e.g. through ngrok for Plaid webhooks) so nobody else can read your transactions.
 */
app.use("/api", (req, res, next) => {
  const token = process.env.APP_TOKEN;
  if (!token || req.path === "/plaid/webhook") return next();
  if (req.get("x-app-token") === token || req.query.token === token) return next();
  res.status(401).json({ error: "unauthorized" });
});

/* Live updates: browsers keep an SSE connection open and refresh when new transactions land. */
const clients = new Set<Response>();
function broadcast(event: string, data: unknown) {
  for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
app.get("/api/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write("retry: 5000\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

app.get("/api/status", (_req, res) => {
  res.json({
    plaidConfigured,
    env: process.env.PLAID_ENV ?? "sandbox",
    webhook: Boolean(process.env.PLAID_WEBHOOK_URL),
    institutions: db.items.map((i) => ({ itemId: i.itemId, institution: i.institution, lastSync: i.lastSync })),
  });
});

app.get("/api/transactions", (_req, res) => {
  res.json({ accounts: db.accounts, transactions: db.transactions });
});

app.post("/api/link/token", async (_req, res) => {
  if (!plaidConfigured) return res.status(400).json({ error: "Add PLAID_CLIENT_ID and PLAID_SECRET to .env" });
  try {
    res.json({ linkToken: await createLinkToken("local-user") });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create Plaid link token" });
  }
});

app.post("/api/link/exchange", async (req, res) => {
  try {
    const item = await exchangePublicToken(req.body.publicToken, req.body.institution);
    const changed = await syncItem(item);
    broadcast("transactions", { changed });
    res.json({ ok: true, changed });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not link account" });
  }
});

app.post("/api/sync", async (_req, res) => {
  const changed = await syncAll();
  if (changed) broadcast("transactions", { changed });
  res.json({ changed });
});

app.delete("/api/items/:itemId", (req, res) => {
  const item = db.items.find((i) => i.itemId === req.params.itemId);
  db.items = db.items.filter((i) => i !== item);
  save();
  res.json({ ok: Boolean(item) });
});

/* Plaid calls this the moment new transactions are available (e.g. right after you tap your card). */
app.post("/api/plaid/webhook", async (req, res) => {
  res.json({ ok: true });
  const { webhook_type, webhook_code, item_id } = req.body ?? {};
  if (webhook_type !== "TRANSACTIONS") return;
  if (!["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE", "HISTORICAL_UPDATE"].includes(webhook_code)) return;
  const item = db.items.find((i) => i.itemId === item_id);
  if (!item) return;
  const changed = await syncItem(item).catch((e) => (console.error(e), 0));
  if (changed) broadcast("transactions", { changed });
});

/* Fallback when no public webhook URL is configured. */
const pollMinutes = Number(process.env.POLL_MINUTES ?? 15);
if (plaidConfigured && pollMinutes > 0) {
  setInterval(async () => {
    const changed = await syncAll();
    if (changed) broadcast("transactions", { changed });
  }, pollMinutes * 60_000);
}

if (process.env.NODE_ENV === "production") {
  const dist = path.resolve("dist");
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`Centsible API on http://localhost:${port} — Plaid ${plaidConfigured ? `ready (${process.env.PLAID_ENV ?? "sandbox"})` : "not configured (CSV import & demo still work)"}`);
});
