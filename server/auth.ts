/**
 * Accounts for family-sized sharing: email + password, cookie sessions, invite-only sign-up.
 * The first person to sign up becomes the owner (and receives any data from the single-user version).
 */
import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import { emptyUserData, save, store, type User } from "./store";

export const COOKIE = "cs_session";
const SESSION_DAYS = 90;

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

export const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res: Response, value: string, maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

export function startSession(res: Response, userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  store.sessions = store.sessions.filter((s) => s.expiresAt > new Date().toISOString()).concat({ idHash: sha256(token), userId, expiresAt });
  save();
  setSessionCookie(res, token, SESSION_DAYS * 86_400);
}

export function endSession(req: Request, res: Response) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const h = sha256(token);
    store.sessions = store.sessions.filter((s) => s.idHash !== h);
    save();
  }
  setSessionCookie(res, "", 0);
}

/** Attaches req.user when a valid session cookie is present. */
export function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const h = sha256(token);
    const s = store.sessions.find((x) => x.idHash === h && x.expiresAt > new Date().toISOString());
    if (s) req.user = store.users.find((u) => u.id === s.userId);
  }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "signed_out" });
  next();
}

/* ---- Brute-force protection: 10 failed sign-ins per email/IP per 15 minutes ---- */
const failures = new Map<string, { count: number; until: number }>();
const WINDOW = 15 * 60_000;
export function tooManyAttempts(key: string): boolean {
  const f = failures.get(key);
  return Boolean(f && f.count >= 10 && f.until > Date.now());
}
export function recordFailure(key: string) {
  const f = failures.get(key);
  if (!f || f.until < Date.now()) failures.set(key, { count: 1, until: Date.now() + WINDOW });
  else f.count++;
}
export const clearFailures = (key: string) => failures.delete(key);

const normalizeEmail = (e: string) => e.trim().toLowerCase();
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export type SignupResult = { ok: true; user: User } | { ok: false; status: number; error: string };

export function signup(body: { name?: string; email?: string; password?: string; invite?: string }): SignupResult {
  const email = normalizeEmail(String(body.email ?? ""));
  const name = String(body.name ?? "").trim() || email.split("@")[0];
  const password = String(body.password ?? "");
  const first = store.users.length === 0;
  if (!validEmail(email)) return { ok: false, status: 400, error: "Enter a valid email address." };
  if (password.length < 8) return { ok: false, status: 400, error: "Use at least 8 characters for your password." };
  if (!first && body.invite !== store.inviteCode) return { ok: false, status: 403, error: "That invite code isn't valid. Ask for a new invite link." };
  if (store.users.some((u) => u.email === email)) return { ok: false, status: 409, error: "An account with this email already exists. Sign in instead." };

  const user: User = { id: crypto.randomUUID(), email, name, passwordHash: hashPassword(password), role: first ? "owner" : "member", createdAt: new Date().toISOString() };
  store.users.push(user);
  // The owner inherits data from the single-user version (banks already connected on this server).
  store.data[user.id] = first && store.legacy ? store.legacy : emptyUserData();
  if (first) store.legacy = undefined;
  save(true);
  return { ok: true, user };
}

export function login(body: { email?: string; password?: string }): User | undefined {
  const email = normalizeEmail(String(body.email ?? ""));
  const user = store.users.find((u) => u.email === email);
  // Always run the hash so response time doesn't reveal whether the email exists.
  const ok = verifyPassword(String(body.password ?? ""), user?.passwordHash ?? hashPassword("x"));
  return ok ? user : undefined;
}

export function changePassword(user: User, current: string, next: string): string | undefined {
  if (!verifyPassword(current, user.passwordHash)) return "Your current password is incorrect.";
  if (next.length < 8) return "Use at least 8 characters for your new password.";
  user.passwordHash = hashPassword(next);
  save();
  return undefined;
}

/** The owner can set a temporary password for a family member who forgot theirs. */
export function resetMemberPassword(memberId: string, temp: string): string | undefined {
  const m = store.users.find((u) => u.id === memberId);
  if (!m) return "No such member.";
  if (temp.length < 8) return "Use at least 8 characters.";
  m.passwordHash = hashPassword(temp);
  store.sessions = store.sessions.filter((s) => s.userId !== m.id); // sign them out everywhere
  save();
  return undefined;
}

export function rotateInvite(): string {
  store.inviteCode = randomToken(9);
  save();
  return store.inviteCode;
}

/** Remove a person and everything stored for them. If the owner leaves, the longest-standing member takes over. */
export function deleteUser(userId: string) {
  const leaving = store.users.find((u) => u.id === userId);
  store.users = store.users.filter((u) => u.id !== userId);
  store.sessions = store.sessions.filter((s) => s.userId !== userId);
  store.push = store.push.filter((p) => p.userId !== userId);
  delete store.data[userId];
  if (leaving?.role === "owner" && store.users.length) store.users[0].role = "owner";
  save(true);
}
