import "dotenv/config";
import express, { type Request, type Response } from "express";
import path from "node:path";
import {
  changePassword,
  clearFailures,
  createPasswordReset,
  finishPasswordReset,
  deleteUser,
  addAllowedEmail,
  endSession,
  googleSignIn,
  loadUser,
  login,
  publicUser,
  recordFailure,
  removeAllowedEmail,
  requireUser,
  resetMemberPassword,
  rotateInvite,
  signup,
  startSession,
  tooManyAttempts,
} from "./auth";
import { emailEnabled, sendEmail } from "./email";
import { finishGoogle, googleEnabled, publicOrigin, startGoogle } from "./google";
import { decryptSecret, encryptSecret, openExport, randomToken, sealExport, type SealedExport } from "./crypto";
import { billsCalendar } from "../src/lib/ics";
import type { Bill } from "../src/lib/bills";
import { APP_NAME } from "../src/brand";
import { createLinkToken, exchangePublicToken, plaidConfigured, removeItem, syncAll, syncItem, updateWebhook, webhookUrl } from "./plaid";
import { checkLimits, subscribe, unsubscribe, vapidPublicKey } from "./push";
import { sendBillReminders } from "./reminders";
import { claimSetupToken, syncSimplefin } from "./simplefin";
import { findItem, save, store, userData, type Item, type UserData } from "./store";

if (process.env.NODE_ENV === "production" && !process.env.DATA_KEY && !process.env.APP_TOKEN) {
  console.error("Refusing to start: set DATA_KEY (a long random value) so stored bank connections are encrypted.");
  process.exit(1);
}

/** Plaid's own explanation (code + message), which says what's actually wrong. */
function plaidError(e: unknown): string {
  const d = (e as { response?: { data?: { error_code?: string; error_message?: string; display_message?: string } } }).response?.data;
  if (!d?.error_code) return (e as Error).message ?? "unknown error";
  return `${d.error_code}: ${d.display_message ?? d.error_message ?? ""}`.trim();
}

/** How many Plaid connections the plan allows (Trial: 10 created in total, across everyone). */
const PLAID_ITEM_LIMIT = Number(process.env.PLAID_ITEM_LIMIT ?? 10);

const app = express();
app.set("trust proxy", 1); // behind Render's proxy: real client IPs and HTTPS
app.use(express.json({ limit: "10mb" }));
app.use(loadUser);

/*
 * Cross-site request protection: cookies are SameSite=Lax, and every state-changing API call must be JSON
 * (a plain HTML form on another site can't send that without the browser asking first).
 */
app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.path === "/plaid/webhook") return next();
  // Checks the header itself: bodyless calls (e.g. DELETE) still send it, and other sites can't without a preflight.
  if (!req.get("content-type")?.toLowerCase().startsWith("application/json")) return res.status(415).json({ error: "JSON required" });
  next();
});

/* ---- Live updates, per person ---- */
const clients = new Map<string, Set<Response>>();
function broadcast(userId: string, event: string, data: unknown) {
  for (const res of clients.get(userId) ?? []) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
app.get("/api/events", requireUser, (req, res) => {
  const id = req.user!.id;
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write("retry: 5000\n\n");
  const set = clients.get(id) ?? clients.set(id, new Set()).get(id)!;
  set.add(res);
  req.on("close", () => set.delete(res));
});

/** After new data: tell that person's open screens, and check limits for phone notifications. */
async function afterSync(userId: string, ud: UserData, changed: number) {
  if (!changed) return;
  broadcast(userId, "transactions", { changed });
  await checkLimits(userId, ud).catch((e) => console.error("[push]", e));
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* ---- Accounts ---- */
app.get("/api/auth/me", (req, res) => {
  const u = req.user;
  res.json({
    user: u ? publicUser(u) : null,
    // Lets the sign-in screen offer "create the first account" on a brand-new server.
    firstRun: store.users.length === 0,
    google: googleEnabled(),
    // "Forgot password?" can email a reset link.
    email: emailEnabled(),
    invite: u?.role === "owner" ? store.inviteCode : undefined,
    members: u?.role === "owner" ? store.users.map(publicUser) : undefined,
    allowedEmails: u?.role === "owner" ? store.allowedEmails : undefined,
    hasPassword: u ? Boolean(u.passwordHash) : undefined,
  });
});

/* ---- Continue with Google ---- */
app.get("/api/auth/google/start", (req, res) => {
  if (!googleEnabled()) return res.redirect("/?signin_error=" + encodeURIComponent("Google sign-in isn't set up on this server yet."));
  startGoogle(req, res);
});
app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const { identity, invite } = await finishGoogle(req, res);
    const r = googleSignIn(identity, invite);
    if (!r.ok) return res.redirect("/?signin_error=" + encodeURIComponent(r.error));
    startSession(res, r.user.id);
    res.redirect("/");
  } catch (e) {
    res.redirect("/?signin_error=" + encodeURIComponent((e as Error).message));
  }
});

app.post("/api/auth/signup", (req, res) => {
  const key = `signup:${req.ip}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  const r = signup(req.body ?? {});
  if (!r.ok) {
    if (r.status === 403) recordFailure(key);
    return res.status(r.status).json({ error: r.error });
  }
  startSession(res, r.user.id);
  res.json({ user: publicUser(r.user) });
});

app.post("/api/auth/login", (req, res) => {
  const key = `login:${req.ip}:${String(req.body?.email ?? "").toLowerCase()}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  const user = login(req.body ?? {});
  if (!user) {
    recordFailure(key);
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  clearFailures(key);
  startSession(res, user.id);
  res.json({ user: publicUser(user) });
});

/* Forgot password: always answers the same way, so it can't be used to find out who has an account. */
app.post("/api/auth/forgot", (req, res) => {
  if (!emailEnabled()) return res.status(400).json({ error: "Password emails aren't set up here yet. Ask the person who invited you to set a temporary password." });
  const key = `forgot:${req.ip}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many requests. Try again in 15 minutes." });
  recordFailure(key); // counts every request: at most 10 emails per 15 minutes from one place
  const made = createPasswordReset(String(req.body?.email ?? ""));
  if (made) {
    const link = `${publicOrigin(req)}/?reset=${encodeURIComponent(made.token)}`;
    const hi = made.user.name ? `Hi ${made.user.name},` : "Hi,";
    sendEmail(
      made.user.email,
      `Reset your ${APP_NAME} password`,
      `${hi}\n\nUse this link to choose a new ${APP_NAME} password. It works for one hour:\n${link}\n\nIf you didn't ask for this, you can ignore this email; your password stays the same.`,
      `<p>${hi}</p><p>Use this link to choose a new ${APP_NAME} password. It works for one hour.</p><p><a href="${link}">Choose a new password</a></p><p style="color:#667">If you didn't ask for this, you can ignore this email; your password stays the same.</p>`,
    ).catch((e) => console.error("[email]", (e as Error).message));
  }
  res.json({ ok: true });
});

app.post("/api/auth/reset", (req, res) => {
  const key = `reset:${req.ip}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  const r = finishPasswordReset(String(req.body?.token ?? ""), String(req.body?.password ?? ""));
  if (!r.ok) {
    recordFailure(key);
    return res.status(400).json({ error: r.error });
  }
  startSession(res, r.user.id);
  res.json({ user: publicUser(r.user) });
});

app.post("/api/auth/logout", (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

app.post("/api/auth/password", requireUser, (req, res) => {
  const err = changePassword(req.user!, String(req.body?.current ?? ""), String(req.body?.next ?? ""));
  if (err) return res.status(400).json({ error: err });
  res.json({ ok: true });
});

const requireOwner = (req: Request, res: Response, next: () => void) =>
  req.user?.role === "owner" ? next() : res.status(403).json({ error: "Only the owner can do that." });

app.post("/api/auth/invite/rotate", requireUser, requireOwner, (_req, res) => res.json({ invite: rotateInvite() }));

app.post("/api/auth/allowed", requireUser, requireOwner, (req, res) => {
  const err = addAllowedEmail(String(req.body?.email ?? ""));
  if (err) return res.status(400).json({ error: err });
  res.json({ allowedEmails: store.allowedEmails });
});
app.delete("/api/auth/allowed/:email", requireUser, requireOwner, (req, res) => {
  removeAllowedEmail(String(req.params.email));
  res.json({ allowedEmails: store.allowedEmails });
});

app.post("/api/auth/members/:id/password", requireUser, requireOwner, (req, res) => {
  const err = resetMemberPassword(String(req.params.id), String(req.body?.password ?? ""));
  if (err) return res.status(400).json({ error: err });
  res.json({ ok: true });
});

/** Delete your account: disconnects your banks at Plaid and erases everything stored for you. */
app.post("/api/auth/delete", requireUser, async (req, res) => {
  const u = req.user!;
  // Password accounts confirm with their password; Google-only accounts type DELETE.
  const confirmed = u.passwordHash ? Boolean(login({ email: u.email, password: String(req.body?.password ?? "") })) : req.body?.password === "DELETE";
  if (!confirmed) return res.status(401).json({ error: u.passwordHash ? "Password is incorrect." : "Type DELETE to confirm." });
  const ud = userData(u.id);
  await Promise.all(ud.items.map(removeItem));
  deleteUser(u.id);
  endSession(req, res);
  res.json({ ok: true });
});

/*
 * Bills calendar feed. Calendar apps fetch it without signing in, so the long random token in the link is the key:
 * it only shows bill names, amounts and due days, and can be turned off or replaced in the app.
 */
app.get("/api/calendar/:file", (req, res) => {
  const token = String(req.params.file).replace(/\.ics$/, "");
  const ud = token.length >= 32 ? Object.values(store.data).find((d) => d.calendarToken === token) : undefined;
  if (!ud) return res.status(404).type("text/plain").send("This calendar link was turned off or replaced in the app.");
  const bills = ((ud.settings?.bills as Bill[] | undefined) ?? []).filter((b) => b && b.id && b.name);
  res
    .type("text/calendar; charset=utf-8")
    .set("Cache-Control", "no-cache")
    .set("Content-Disposition", `inline; filename="${APP_NAME.toLowerCase()}-bills.ics"`)
    .send(billsCalendar(bills, { appName: APP_NAME, appUrl: publicOrigin(req) }));
});

/* Everything below is your own data only. */
app.use("/api", (req, res, next) => (req.path === "/plaid/webhook" ? next() : requireUser(req, res, next)));
const mine = (req: Request) => userData(req.user!.id);

app.get("/api/status", (req, res) => {
  const ud = mine(req);
  res.json({
    plaidConfigured,
    env: process.env.PLAID_ENV ?? "sandbox",
    webhook: Boolean(webhookUrl()),
    institutions: ud.items.map((i) => ({ itemId: i.itemId, institution: i.institution, lastSync: i.lastSync })),
    simplefin: ud.simplefin
      ? { connected: true, lastSync: ud.simplefin.lastSync, institutions: ud.simplefin.institutions ?? [], errors: ud.simplefin.errors ?? [] }
      : { connected: false },
    plaidConnections: { used: store.plaidItemsCreated, limit: PLAID_ITEM_LIMIT },
    pushKey: vapidPublicKey(),
  });
});

app.get("/api/transactions", (req, res) => {
  const ud = mine(req);
  res.json({ accounts: ud.accounts, transactions: ud.transactions });
});

/* Settings (categories, limits, edits, home layout…) live on the server so your phone and computer match. */
app.get("/api/settings", (req, res) => {
  const ud = mine(req);
  res.json({ settings: ud.settings ?? null, updatedAt: ud.settingsUpdatedAt ?? null });
});
app.put("/api/settings", async (req, res) => {
  const settings = req.body?.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return res.status(400).json({ error: "settings must be an object" });
  const ud = mine(req);
  ud.settings = settings;
  ud.settingsUpdatedAt = new Date().toISOString();
  save();
  broadcast(req.user!.id, "settings", { updatedAt: ud.settingsUpdatedAt });
  res.json({ ok: true, updatedAt: ud.settingsUpdatedAt });
});

/* ---- Plaid ---- */
app.post("/api/link/token", async (req, res) => {
  if (!plaidConfigured) return res.status(400).json({ error: "Add PLAID_CLIENT_ID and PLAID_SECRET to the server settings." });
  if (process.env.PLAID_ENV === "production" && store.plaidItemsCreated >= PLAID_ITEM_LIMIT)
    return res.status(400).json({
      error: `This app has used all ${PLAID_ITEM_LIMIT} bank connections its Plaid plan allows. The owner can upgrade the Plaid plan, or you can connect with SimpleFIN below.`,
    });
  try {
    res.json({ linkToken: await createLinkToken(req.user!.id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: `Could not start Plaid: ${plaidError(e)}` });
  }
});

app.post("/api/link/exchange", async (req, res) => {
  const ud = mine(req);
  try {
    const item = await exchangePublicToken(ud, req.body.publicToken, req.body.institution);
    const changed = await syncItem(ud, item);
    await afterSync(req.user!.id, ud, changed);
    res.json({ ok: true, changed });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: `Could not link account: ${plaidError(e)}` });
  }
});

app.delete("/api/items/:itemId", async (req, res) => {
  const ud = mine(req);
  const item = ud.items.find((i) => i.itemId === req.params.itemId);
  if (item) await removeItem(item);
  ud.items = ud.items.filter((i) => i !== item);
  save();
  res.json({ ok: Boolean(item) });
});

/* ---- SimpleFIN: paste a Setup Token once; the private Access URL stays on the server, encrypted ---- */
app.post("/api/simplefin/connect", async (req, res) => {
  const ud = mine(req);
  try {
    const accessUrl = await claimSetupToken(String(req.body?.setupToken ?? ""));
    ud.simplefin = { accessUrl: encryptSecret(accessUrl) };
    save();
    const changed = await syncSimplefin(ud);
    await afterSync(req.user!.id, ud, changed);
    res.json({ ok: true, changed, institutions: ud.simplefin.institutions ?? [] });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
app.delete("/api/simplefin", (req, res) => {
  mine(req).simplefin = undefined;
  save();
  res.json({ ok: true });
});

app.post("/api/sync", async (req, res) => {
  const ud = mine(req);
  const changed = (await syncAll(ud)) + (await syncSimplefin(ud).catch((e) => (console.error("[simplefin]", e), 0)));
  await afterSync(req.user!.id, ud, changed);
  res.json({ changed });
});

/* ---- Bills calendar link (Google / Apple / Outlook subscribe to it) ---- */
const calendarUrl = (req: Request, ud: UserData) => (ud.calendarToken ? `${publicOrigin(req)}/api/calendar/${ud.calendarToken}.ics` : null);
app.get("/api/calendar", (req, res) => res.json({ url: calendarUrl(req, mine(req)) }));
app.post("/api/calendar", (req, res) => {
  const ud = mine(req);
  ud.calendarToken = randomToken(24); // makes a new link; the old one stops working
  save(true);
  res.json({ url: calendarUrl(req, ud) });
});
app.delete("/api/calendar", (req, res) => {
  delete mine(req).calendarToken;
  save(true);
  res.json({ url: null });
});

/* ---- Notifications ---- */
app.post("/api/push/subscribe", (req, res) => {
  const sub = req.body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return res.status(400).json({ error: "Invalid subscription" });
  subscribe(req.user!.id, sub);
  res.json({ ok: true });
});
app.post("/api/push/unsubscribe", (req, res) => {
  unsubscribe(String(req.body?.endpoint ?? ""));
  res.json({ ok: true });
});

/* ---- Move your data between servers (e.g. from your computer to Render) ---- */
interface ExportPayload {
  items: (Omit<Item, "accessToken"> & { accessToken: string })[];
  accounts: UserData["accounts"];
  transactions: UserData["transactions"];
  settings?: UserData["settings"];
  simplefinUrl?: string;
}

app.post("/api/export", (req, res) => {
  const passphrase = String(req.body?.passphrase ?? "");
  if (passphrase.length < 8) return res.status(400).json({ error: "Choose a passphrase of at least 8 characters." });
  const ud = mine(req);
  // Secrets are decrypted here and re-sealed with your passphrase, so the file works on a server with a different key.
  const payload: ExportPayload = {
    items: ud.items.map((i) => ({ ...i, accessToken: decryptSecret(i.accessToken) })),
    accounts: ud.accounts,
    transactions: ud.transactions,
    settings: ud.settings,
    simplefinUrl: ud.simplefin ? decryptSecret(ud.simplefin.accessUrl) : undefined,
  };
  res.json(sealExport(payload, passphrase));
});

app.post("/api/import", async (req, res) => {
  let payload: ExportPayload;
  try {
    payload = openExport<ExportPayload>(req.body?.file as SealedExport, String(req.body?.passphrase ?? ""));
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
  const ud = mine(req);
  const known = new Set(ud.items.map((i) => i.itemId));
  const added = payload.items.filter((i) => !known.has(i.itemId)).map((i) => ({ ...i, accessToken: encryptSecret(i.accessToken) }));
  ud.items.push(...added);
  const accts = new Map(ud.accounts.map((a) => [a.id, a]));
  for (const a of payload.accounts) accts.set(a.id, { ...a, ...accts.get(a.id) });
  ud.accounts = [...accts.values()];
  const txs = new Map(payload.transactions.map((t) => [t.id, t]));
  for (const t of ud.transactions) txs.set(t.id, t);
  ud.transactions = [...txs.values()];
  if (payload.settings && !ud.settings) {
    ud.settings = payload.settings;
    ud.settingsUpdatedAt = new Date().toISOString();
  }
  if (payload.simplefinUrl && !ud.simplefin) ud.simplefin = { accessUrl: encryptSecret(payload.simplefinUrl) };
  save(true);
  // Plaid should now send "new purchase" webhooks here instead of the old server.
  await Promise.all(added.map(updateWebhook));
  broadcast(req.user!.id, "transactions", { changed: added.length });
  broadcast(req.user!.id, "settings", {});
  res.json({ ok: true, banks: added.length, transactions: payload.transactions.length });
});

/* ---- Plaid calls this the moment new transactions are available ---- */
app.post("/api/plaid/webhook", async (req, res) => {
  res.json({ ok: true });
  const { webhook_type, webhook_code, item_id } = req.body ?? {};
  if (webhook_type !== "TRANSACTIONS") return;
  if (!["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE", "HISTORICAL_UPDATE"].includes(webhook_code)) return;
  const found = findItem(String(item_id));
  if (!found) return;
  const changed = await syncItem(found.data, found.item).catch((e) => (console.error(e), 0));
  await afterSync(found.userId, found.data, changed);
});

/* ---- Background syncing for everyone ---- */
async function syncEveryone(kind: "plaid" | "simplefin") {
  for (const [userId, ud] of Object.entries(store.data)) {
    const changed =
      kind === "plaid" ? await syncAll(ud) : ud.simplefin ? await syncSimplefin(ud).catch((e) => (console.error("[simplefin]", e), 0)) : 0;
    await afterSync(userId, ud, changed);
  }
}
/* Bill reminders: checked hourly (each reminder is sent once, in the person's daytime). */
setInterval(() => sendBillReminders().catch((e) => console.error("[bills]", e)), 60 * 60_000);
setTimeout(() => sendBillReminders().catch((e) => console.error("[bills]", e)), 30_000);

/* SimpleFIN refreshes about daily and allows roughly 24 requests a day: check every 3 hours. */
setInterval(() => syncEveryone("simplefin"), 3 * 60 * 60_000);
/* Plaid: webhooks do the fast path; this catches anything missed. */
const pollMinutes = Number(process.env.POLL_MINUTES ?? 15);
if (plaidConfigured && pollMinutes > 0) setInterval(() => syncEveryone("plaid"), pollMinutes * 60_000);

if (process.env.NODE_ENV === "production") {
  const dist = path.resolve("dist");
  app.use(express.static(dist, { index: false }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(
    `Centsible API on http://localhost:${port} — Plaid ${plaidConfigured ? `ready (${process.env.PLAID_ENV ?? "sandbox"})` : "not configured"} · ${store.users.length} account(s)`,
  );
});
