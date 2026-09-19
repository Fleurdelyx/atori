/**
 * Auth helpers — email/password accounts + session tokens, Workers-native.
 *
 * Passwords: PBKDF2-SHA-256 via WebCrypto (no deps). If the free-plan CPU
 * cap rejects the 100k iterations, lower PBKDF2_ITERATIONS to 25_000.
 * Sessions: 32 random bytes (base64url); only the SHA-256 hex hash is stored,
 * 30-day expiry with sliding renewal on use.
 */

export const PBKDF2_ITERATIONS = 100_000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** renew the session row when less than this much life remains */
export const SESSION_RENEW_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/* ---------- encoding ---------- */

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ---------- hashing ---------- */

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeSalt(): Promise<string> {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password: string, saltB64: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(saltB64), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

/** constant-time-ish equality for fixed-length hex digests */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- sessions ---------- */

export function newSessionToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = newSessionToken();
  const now = Date.now();
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now, now + SESSION_TTL_MS)
    .run();
  return token;
}

/** Resolve a session token to its user, sliding the expiry forward. */
export async function userForToken(db: D1Database, token: string): Promise<SessionUser | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const row = await db
    .prepare(
      "SELECT u.id, u.email, u.name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
    )
    .bind(tokenHash)
    .first<{ id: string; email: string; name: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < now) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  if (row.expires_at - now < SESSION_RENEW_MS) {
    await db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").bind(now + SESSION_TTL_MS, tokenHash).run();
  }
  return { id: row.id, email: row.email, name: row.name };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
}

/* ---------- login rate limiting (best-effort, per isolate) ---------- */

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}

/* ---------- validation ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistration(email: string, password: string, name: string): string | null {
  if (!EMAIL_RE.test(email)) return "Enter a valid email address";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 200) return "Password too long";
  if (name.length < 1 || name.length > 40) return "Name must be 1–40 characters";
  return null;
}
