import type { Account, Transaction } from "./lib/types";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw Object.assign(new Error((await res.json().catch(() => ({}))).error ?? res.statusText), { status: res.status });
  return res.json();
}
const post = <T,>(path: string, body: unknown = {}) => call<T>(path, { method: "POST", body: JSON.stringify(body) });

export interface User {
  id: string;
  email: string;
  name: string;
  role: "owner" | "member";
}

export interface Me {
  user: User | null;
  firstRun: boolean;
  invite?: string;
  members?: User[];
}

export interface ServerStatus {
  plaidConfigured: boolean;
  env: string;
  webhook: boolean;
  institutions: { itemId: string; institution?: string; lastSync?: string }[];
  simplefin: { connected: boolean; lastSync?: string; institutions?: string[]; errors?: string[] };
  plaidConnections: { used: number; limit: number };
  pushKey: string;
}

export const api = {
  me: () => call<Me>("/api/auth/me"),
  signup: (body: { name: string; email: string; password: string; invite?: string }) => post<{ user: User }>("/api/auth/signup", body),
  login: (email: string, password: string) => post<{ user: User }>("/api/auth/login", { email, password }),
  logout: () => post<{ ok: boolean }>("/api/auth/logout"),
  changePassword: (current: string, next: string) => post<{ ok: boolean }>("/api/auth/password", { current, next }),
  rotateInvite: () => post<{ invite: string }>("/api/auth/invite/rotate"),
  resetMemberPassword: (id: string, password: string) => post<{ ok: boolean }>(`/api/auth/members/${id}/password`, { password }),
  deleteAccount: (password: string) => post<{ ok: boolean }>("/api/auth/delete", { password }),

  status: () => call<ServerStatus>("/api/status"),
  transactions: () => call<{ accounts: Account[]; transactions: Transaction[] }>("/api/transactions"),
  linkToken: () => post<{ linkToken: string }>("/api/link/token"),
  exchange: (publicToken: string, institution?: string) => post<{ changed: number }>("/api/link/exchange", { publicToken, institution }),
  simplefinConnect: (setupToken: string) => post<{ changed: number; institutions: string[] }>("/api/simplefin/connect", { setupToken }),
  simplefinDisconnect: () => call<{ ok: boolean }>("/api/simplefin", { method: "DELETE" }),
  sync: () => post<{ changed: number }>("/api/sync"),
  unlink: (itemId: string) => call<{ ok: boolean }>(`/api/items/${itemId}`, { method: "DELETE" }),
  getSettings: () => call<{ settings: Record<string, unknown> | null; updatedAt: string | null }>("/api/settings"),
  putSettings: (settings: Record<string, unknown>) =>
    call<{ ok: boolean }>("/api/settings", { method: "PUT", body: JSON.stringify({ settings }) }),
  pushSubscribe: (subscription: PushSubscriptionJSON) => post<{ ok: boolean }>("/api/push/subscribe", { subscription }),
  pushUnsubscribe: (endpoint: string) => post<{ ok: boolean }>("/api/push/unsubscribe", { endpoint }),
  exportData: (passphrase: string) => post<Record<string, unknown>>("/api/export", { passphrase }),
  importData: (file: unknown, passphrase: string) => post<{ banks: number; transactions: number }>("/api/import", { file, passphrase }),
  events: () => new EventSource("/api/events"),
};
