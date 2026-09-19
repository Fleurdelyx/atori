import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToBase64Url,
  hashPassword,
  makeSalt,
  newSessionToken,
  rateLimited,
  safeEqualHex,
  sha256Hex,
  validateRegistration,
} from "./auth";

describe("password hashing", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const salt = await makeSalt();
    const hash = await hashPassword("correct horse battery", salt);
    expect(hash).not.toBe(salt);
    expect(await hashPassword("correct horse battery", salt)).toBe(hash);
    expect(await hashPassword("wrong password", salt)).not.toBe(hash);
  });

  it("uses a unique salt per call so equal passwords hash differently", async () => {
    const s1 = await makeSalt();
    const s2 = await makeSalt();
    expect(s1).not.toBe(s2);
    expect(await hashPassword("same", s1)).not.toBe(await hashPassword("same", s2));
  });
});

describe("session tokens", () => {
  it("are unique and round-trip through sha256 hashing", async () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const h = await sha256Hex(a);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(a)).toBe(h);
    expect(await sha256Hex(b)).not.toBe(h);
  });
});

describe("safeEqualHex", () => {
  it("matches equal digests and rejects different ones", () => {
    expect(safeEqualHex("abc123", "abc123")).toBe(true);
    expect(safeEqualHex("abc123", "abc124")).toBe(false);
    expect(safeEqualHex("abc", "abcd")).toBe(false);
  });
});

describe("base64 helpers", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    const url = bytesToBase64Url(bytes);
    expect(url).not.toMatch(/[+/=]/);
  });
});

describe("rateLimited", () => {
  it("allows the first attempts and trips past the cap", () => {
    const key = `test:${Math.random()}`;
    expect(rateLimited(key)).toBe(false);
    for (let i = 0; i < 9; i++) rateLimited(key);
    expect(rateLimited(key)).toBe(true);
  });
});

describe("validateRegistration", () => {
  it("accepts a sane registration", () => {
    expect(validateRegistration("a@b.io", "longenough1", "Rin")).toBeNull();
  });
  it("rejects bad email, short password, empty name", () => {
    expect(validateRegistration("nope", "longenough1", "Rin")).toMatch(/email/i);
    expect(validateRegistration("a@b.io", "short", "Rin")).toMatch(/password/i);
    expect(validateRegistration("a@b.io", "longenough1", "")).toMatch(/name/i);
  });
});
