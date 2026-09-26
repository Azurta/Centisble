import fs from "node:fs";
import path from "node:path";
import type { Account, Transaction } from "../src/lib/types";
import type { SimplefinConnection } from "./simplefin";

export interface Item {
  itemId: string;
  accessToken: string;
  institution?: string;
  cursor?: string;
  lastSync?: string;
  /** When interest rates / due dates were last fetched (they change rarely, so at most twice a day). */
  liabilitiesAt?: string;
}

interface Db {
  items: Item[];
  accounts: Account[];
  transactions: Transaction[];
  /** App settings (categories, limits, edits, home layout…) shared by every device you open the app on. */
  settings?: Record<string, unknown>;
  simplefin?: SimplefinConnection;
  settingsUpdatedAt?: string;
}

const file = path.resolve(process.env.DATA_DIR ?? "data", "db.json");

function load(): Db {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { items: [], accounts: [], transactions: [] };
  }
}

export const db: Db = load();

export function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  // Access tokens live here: keep the file readable only by the owner.
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
