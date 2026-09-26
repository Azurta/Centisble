import { loadJson } from "./lib/storage";
import type { Account, Transaction } from "./lib/types";

export const appToken = () => loadJson<string>("azurta.token", "");

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", "x-app-token": appToken(), ...(init.headers ?? {}) },
  });
  if (!res.ok) throw Object.assign(new Error((await res.json().catch(() => ({}))).error ?? res.statusText), { status: res.status });
  return res.json();
}

export interface ServerStatus {
  plaidConfigured: boolean;
  env: string;
  webhook: boolean;
  institutions: { itemId: string; institution?: string; lastSync?: string }[];
}

export const api = {
  status: () => call<ServerStatus>("/api/status"),
  transactions: () => call<{ accounts: Account[]; transactions: Transaction[] }>("/api/transactions"),
  linkToken: () => call<{ linkToken: string }>("/api/link/token", { method: "POST" }),
  exchange: (publicToken: string, institution?: string) =>
    call<{ changed: number }>("/api/link/exchange", { method: "POST", body: JSON.stringify({ publicToken, institution }) }),
  sync: () => call<{ changed: number }>("/api/sync", { method: "POST" }),
  unlink: (itemId: string) => call<{ ok: boolean }>(`/api/items/${itemId}`, { method: "DELETE" }),
  events: () => new EventSource(`/api/events?token=${encodeURIComponent(appToken())}`),
};
