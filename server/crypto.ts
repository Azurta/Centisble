/**
 * Encryption for secrets at rest (Plaid access tokens, SimpleFIN access URLs) and for data exports.
 * The server key comes from DATA_KEY. Without it (local use) a random key is created once in the data folder.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PREFIX = "enc:v1:";

const derive = (s: string) => crypto.createHash("sha256").update(s).digest();

/** Keys we can decrypt with, newest first. APP_TOKEN is how servers set up before DATA_KEY existed are keyed. */
function candidateKeys(): Buffer[] {
  return [process.env.DATA_KEY, process.env.APP_TOKEN].filter((v): v is string => Boolean(v)).map(derive);
}

function loadKey(): Buffer {
  const env = candidateKeys();
  if (env.length) return env[0];
  if (process.env.NODE_ENV === "production") throw new Error("DATA_KEY is required in production");
  const file = path.resolve(process.env.DATA_DIR ?? "data", "secret.key");
  try {
    return Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
  } catch {
    const key = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, key.toString("base64"), { mode: 0o600 });
    return key;
  }
}

let key: Buffer | undefined;
const serverKey = () => (key ??= loadKey());

function seal(plain: string, k: Buffer): { iv: string; tag: string; data: string } {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return { iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") };
}

function open(box: { iv: string; tag: string; data: string }, k: Buffer): string {
  const d = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(box.iv, "base64"));
  d.setAuthTag(Buffer.from(box.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(box.data, "base64")), d.final()]).toString("utf8");
}

export const isEncrypted = (s: string) => s.startsWith(PREFIX);

/** Encrypt a secret for storage; already-encrypted values pass through. */
export function encryptSecret(plain: string): string {
  if (isEncrypted(plain)) return plain;
  const b = seal(plain, serverKey());
  return `${PREFIX}${b.iv}:${b.tag}:${b.data}`;
}

/** Decrypt a stored secret; plain (legacy) values pass through. */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const [iv, tag, data] = stored.slice(PREFIX.length).split(":");
  for (const k of [serverKey(), ...candidateKeys()]) {
    try {
      return open({ iv, tag, data }, k);
    } catch {
      /* try the next key */
    }
  }
  throw new Error("Can't decrypt a stored bank connection: DATA_KEY/APP_TOKEN changed. Restore the previous value.");
}

/* ---- Passphrase-protected export files (for moving to another server) ---- */

export interface SealedExport {
  format: "centsible-export";
  version: 1;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

const passKey = (passphrase: string, salt: Buffer) => crypto.scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export function sealExport(payload: unknown, passphrase: string): SealedExport {
  const salt = crypto.randomBytes(16);
  const b = seal(JSON.stringify(payload), passKey(passphrase, salt));
  return { format: "centsible-export", version: 1, salt: salt.toString("base64"), ...b };
}

export function openExport<T>(file: SealedExport, passphrase: string): T {
  if (file?.format !== "centsible-export") throw new Error("That isn't a Centsible export file.");
  try {
    return JSON.parse(open(file, passKey(passphrase, Buffer.from(file.salt, "base64")))) as T;
  } catch {
    throw new Error("Wrong passphrase, or the file is damaged.");
  }
}

/* ---- Passwords & session tokens ---- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(salt, "base64"), expected.length, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(actual, expected);
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("base64url");
