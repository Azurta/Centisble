import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATA_KEY = "test-key-for-unit-tests";
});

describe("crypto", async () => {
  const c = await import("./crypto");

  it("encrypts secrets at rest and passes legacy plain values through", () => {
    const enc = c.encryptSecret("access-production-abc");
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain("access-production-abc");
    expect(c.decryptSecret(enc)).toBe("access-production-abc");
    expect(c.encryptSecret(enc)).toBe(enc);
    expect(c.decryptSecret("plain-legacy")).toBe("plain-legacy");
  });

  it("seals exports with a passphrase", () => {
    const sealed = c.sealExport({ items: [{ accessToken: "secret" }] }, "correct horse");
    expect(JSON.stringify(sealed)).not.toContain("secret");
    expect(c.openExport<{ items: { accessToken: string }[] }>(sealed, "correct horse").items[0].accessToken).toBe("secret");
    expect(() => c.openExport(sealed, "wrong passphrase")).toThrow(/Wrong passphrase/);
  });

  it("hashes and verifies passwords", () => {
    const h = c.hashPassword("hunter22!");
    expect(c.verifyPassword("hunter22!", h)).toBe(true);
    expect(c.verifyPassword("hunter23!", h)).toBe(false);
  });
});
