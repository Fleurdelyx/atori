import { Hono, type MiddlewareHandler } from "hono";
import {
  clearAttempts,
  createSession,
  deleteSession,
  hashPassword,
  makeSalt,
  rateLimited,
  safeEqualHex,
  userForToken,
  validateRegistration,
  type SessionUser,
} from "./auth";

/**
 * atori-cloud — Cloudflare Worker fronting an R2 bucket + D1 accounts.
 *
 * Two access modes share the bucket:
 *
 * 1. ACCOUNTS (per-user, D1 sessions) — register/login, then:
 *      GET  /api/auth/me            → session user
 *      POST /api/auth/register      → {email,password,name} → session
 *      POST /api/auth/login         → {email,password}      → session
 *      POST /api/auth/logout        → invalidate session
 *      GET|PUT /api/library/manifest        → u/<uid>/manifest.json
 *      PUT /api/library/upload/<key>        → u/<uid>/<key>
 *      DELETE /api/library/object/<key>     → u/<uid>/<key>
 *      GET /api/stream/<key>                → u/<uid>/<key>, Range (206)
 *      GET|PUT /api/favorites               → saved track keys
 *      GET|PUT /api/playlists               → cloud playlists
 *    Session rides `Authorization: Bearer` or `?token=` (media elements).
 *
 * 2. LEGACY shared token (advanced/self-host mode) — unchanged:
 *      GET|PUT /api/manifest, PUT /api/upload/<key>,
 *      DELETE /api/object/<key>, GET /api/stream/<key>
 *    `Authorization: Bearer <AUTH_TOKEN>` or `?token=<AUTH_TOKEN>`.
 *
 * `/api/stream/<key>` accepts either credential: a valid session scopes the
 * key to `u/<uid>/…`, the legacy token scopes it to the bucket root.
 */

interface Env {
  LIBRARY: R2Bucket;
  AUTH: D1Database;
  AUTH_TOKEN: string;
  ALLOWED_ORIGIN: string;
  /** Cobalt-compatible downloader API base — empty/absent disables remote downloads */
  DL_BASE?: string;
  /** optional API key for the downloader instance */
  DL_KEY?: string;
}

const OBJECT_KEY = /^(audio|cover)\/[A-Za-z0-9 ._\-/]{1,400}$/;

function decodeKey(raw: string): string {
  const segs = raw.split("/");
  let out = segs[0];
  for (let i = 1; i < segs.length; i++) {
    out += "/" + decodeURIComponent(segs[i]);
  }
  return out;
}

function parseRange(header: string): R2Range | null {
  const m = header.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null;
  const a = m[1];
  const b = m[2];
  if (a === "" && b === "") return null;
  if (a === "") {
    const suffix = parseInt(b, 10);
    return suffix > 0 ? { suffix } : null;
  }
  const offset = parseInt(a, 10);
  if (Number.isNaN(offset) || offset < 0) return null;
  if (b === "") return { offset };
  const end = parseInt(b, 10);
  if (Number.isNaN(end) || end < offset) return null;
  return { offset, length: end - offset + 1 };
}

function keyAfter(path: string, prefix: string): string {
  return decodeKey(path.slice(prefix.length));
}

function bearerOrQueryToken(c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } }): string | null {
  const header = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") || null;
  return header ?? c.req.query("token") ?? null;
}

const app = new Hono<{ Bindings: Env; Variables: { user: SessionUser } }>();

/* ---------- CORS (allow-listed origin) ---------- */
app.use("*", async (c, next) => {
  const origin = c.req.header("Origin") ?? "";
  const allow = c.env.ALLOWED_ORIGIN;
  const corsOrigin = allow === "*" ? "*" : origin !== "" && origin === allow ? origin : null;

  if (c.req.method === "OPTIONS") {
    if (corsOrigin) {
      c.header("Access-Control-Allow-Origin", corsOrigin);
      c.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
      c.header("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
      c.header("Access-Control-Max-Age", "86400");
      return c.body(null, 204);
    }
    return c.body(null, 403);
  }

  await next();
  // stamp the actual response too — handlers may return raw Responses
  if (corsOrigin && c.res) {
    c.res.headers.set("Access-Control-Allow-Origin", corsOrigin);
    c.res.headers.set("Access-Control-Expose-Headers", "Content-Range, ETag");
  }
});

/* ---------- health (public, registered before auth middleware) ---------- */
app.get("/api/health", (c) => c.json({ ok: true, service: "atori-cloud", version: 2 }));

/* ---------- accounts: register / login / logout / me ---------- */

function publicUser(u: SessionUser) {
  return { id: u.id, email: u.email, name: u.name };
}

app.post("/api/auth/register", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; name?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request body" }, 400);
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const name = (body.name ?? "").trim() || email.split("@")[0];
  const invalid = validateRegistration(email, password, name);
  if (invalid) return c.json({ error: invalid }, 400);
  if (rateLimited(`register:${email}`)) return c.json({ error: "Too many attempts — try again later" }, 429);

  try {
    const exists = await c.env.AUTH.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (exists) return c.json({ error: "An account with this email already exists" }, 409);
    const id = crypto.randomUUID();
    const salt = await makeSalt();
    const pwHash = await hashPassword(password, salt);
    await c.env.AUTH
      .prepare("INSERT INTO users (id, email, name, pw_hash, pw_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, email, name, pwHash, salt, Date.now())
      .run();
    const token = await createSession(c.env.AUTH, id);
    return c.json({ sessionToken: token, user: { id, email, name } });
  } catch (e) {
    console.error("register failed", e);
    return c.json({ error: "Storage error — try again" }, 500);
  }
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request body" }, 400);
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (rateLimited(`login:${email}`)) return c.json({ error: "Too many attempts — try again later" }, 429);

  try {
    const row = await c.env.AUTH
      .prepare("SELECT id, email, name, pw_hash, pw_salt FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string; email: string; name: string; pw_hash: string; pw_salt: string }>();
    if (!row) return c.json({ error: "Invalid email or password" }, 401);
    const attempt = await hashPassword(password, row.pw_salt);
    if (!safeEqualHex(attempt, row.pw_hash)) return c.json({ error: "Invalid email or password" }, 401);
    clearAttempts(`login:${email}`);
    const token = await createSession(c.env.AUTH, row.id);
    return c.json({ sessionToken: token, user: publicUser({ id: row.id, email: row.email, name: row.name }) });
  } catch (e) {
    console.error("login failed", e);
    return c.json({ error: "Storage error — try again" }, 500);
  }
});

/* ---------- session auth middleware (accounts mode) ---------- */

const sessionAuth: MiddlewareHandler = async (c, next) => {
  const token = bearerOrQueryToken(c);
  const user = token ? await userForToken(c.env.AUTH, token) : null;
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  await next();
};

app.post("/api/auth/logout", sessionAuth, async (c) => {
  const token = bearerOrQueryToken(c);
  if (token) await deleteSession(c.env.AUTH, token);
  return c.json({ ok: true });
});

app.get("/api/auth/me", sessionAuth, (c) => c.json({ user: publicUser(c.get("user")) }));

/* ---------- account-scoped library ---------- */

app.use("/api/library/*", sessionAuth);
app.use("/api/favorites", sessionAuth);
app.use("/api/playlists", sessionAuth);

app.get("/api/library/manifest", async (c) => {
  const key = `u/${c.get("user").id}/manifest.json`;
  const obj = await c.env.LIBRARY.get(key);
  if (!obj) return c.json({ version: 1, updatedAt: 0, tracks: [] });
  return new Response(obj.body, {
    headers: { "Content-Type": "application/json", ETag: obj.httpEtag },
  });
});

app.put("/api/library/manifest", async (c) => {
  const body = await c.req.text();
  try {
    const parsed = JSON.parse(body) as { tracks?: unknown };
    if (!Array.isArray(parsed.tracks)) return c.text("Manifest must contain tracks[]", 400);
  } catch {
    return c.text("Manifest must be valid JSON", 400);
  }
  const key = `u/${c.get("user").id}/manifest.json`;
  await c.env.LIBRARY.put(key, body, {
    httpMetadata: { contentType: "application/json" },
  });
  return c.json({ ok: true });
});

app.put("/api/library/upload/*", async (c) => {
  const inner = keyAfter(c.req.path, "/api/library/upload/");
  if (!OBJECT_KEY.test(inner)) return c.text("Bad key — must be audio/… or cover/…", 400);
  const body = c.req.raw.body;
  if (!body) return c.text("Empty body", 400);
  const key = `u/${c.get("user").id}/${inner}`;
  await c.env.LIBRARY.put(key, body, {
    httpMetadata: { contentType: c.req.header("Content-Type") ?? "application/octet-stream" },
  });
  return c.json({ ok: true, key: inner });
});

app.delete("/api/library/object/*", async (c) => {
  const inner = keyAfter(c.req.path, "/api/library/object/");
  if (!OBJECT_KEY.test(inner)) return c.text("Bad key", 400);
  await c.env.LIBRARY.delete(`u/${c.get("user").id}/${inner}`);
  return c.json({ ok: true });
});

/* ---------- account resume state (continue listening on any device) ---------- */

app.get("/api/library/resume", async (c) => {
  const obj = await c.env.LIBRARY.get(`u/${c.get("user").id}/resume.json`);
  if (!obj) return c.json({ savedAt: 0 });
  return new Response(obj.body, {
    headers: { "Content-Type": "application/json" },
  });
});

app.put("/api/library/resume", async (c) => {
  const body = await c.req.text();
  try {
    const parsed = JSON.parse(body) as { track?: unknown; pos?: unknown; savedAt?: unknown };
    if (
      !parsed ||
      typeof parsed.savedAt !== "number" ||
      typeof parsed.pos !== "number" ||
      typeof parsed.track !== "object" ||
      parsed.track === null
    ) {
      return c.text("Body must be { track, pos, savedAt }", 400);
    }
  } catch {
    return c.text("Body must be valid JSON", 400);
  }
  await c.env.LIBRARY.put(`u/${c.get("user").id}/resume.json`, body, {
    httpMetadata: { contentType: "application/json" },
  });
  return c.json({ ok: true });
});

/* ---------- public share links (read-only playlists) ---------- */

interface ShareDoc {
  name: string;
  ownerUid: string;
  trackKeys: string[];
  createdAt: number;
}

const SHARE_TOKEN = /^[a-z0-9]{8}$/;
const SHARE_CAP = 50;

app.post("/api/library/share", async (c) => {
  const body = await c.req.json<{ name?: string; trackKeys?: string[] }>().catch(() => null);
  if (!body || typeof body.name !== "string" || !Array.isArray(body.trackKeys)) {
    return c.json({ error: "Body must be { name, trackKeys[] }" }, 400);
  }
  const trackKeys = body.trackKeys.filter((k) => typeof k === "string").slice(0, 500);
  if (trackKeys.length === 0) return c.json({ error: "Nothing to share" }, 400);

  const uid = c.get("user").id;
  const listRow = await c.env.LIBRARY.get(`u/${uid}/shares.json`);
  const list = listRow ? ((await listRow.json()) as { tokens: string[] }) : { tokens: [] };
  if (list.tokens.length >= SHARE_CAP) return c.json({ error: "Share limit reached (50)" }, 429);

  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const doc: ShareDoc = {
    name: body.name.slice(0, 120),
    ownerUid: uid,
    trackKeys,
    createdAt: Date.now(),
  };
  await c.env.LIBRARY.put(`share/${token}.json`, JSON.stringify(doc), {
    httpMetadata: { contentType: "application/json" },
  });
  list.tokens.push(token);
  await c.env.LIBRARY.put(`u/${uid}/shares.json`, JSON.stringify(list), {
    httpMetadata: { contentType: "application/json" },
  });
  return c.json({ ok: true, token });
});

// public: share metadata + landing page
app.get("/api/share/:token", async (c) => {
  const token = c.req.param("token");
  if (!SHARE_TOKEN.test(token)) return c.text("Bad token", 400);
  const obj = await c.env.LIBRARY.get(`share/${token}.json`);
  if (!obj) return c.text("Not found", 404);
  return new Response(obj.body, { headers: { "Content-Type": "application/json" } });
});

// public: minimal landing page with per-track <audio> players
app.get("/s/:token", async (c) => {
  const token = c.req.param("token");
  if (!SHARE_TOKEN.test(token)) return c.text("Bad token", 400);
  const obj = await c.env.LIBRARY.get(`share/${token}.json`);
  if (!obj) return c.text("Not found", 404);
  const doc = (await obj.json()) as ShareDoc;
  const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const rows = doc.trackKeys
    .map((k, i) => {
      const name = esc(decodeURIComponent(k.split("/").pop() ?? `Track ${i + 1}`).replace(/\.[^.]+$/, ""));
      return `<li><span>${i + 1}. ${name}</span><audio controls preload="none" src="/api/share/${token}/${i}"></audio></li>`;
    })
    .join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.name)} — ATRI share</title>
<style>body{background:#121212;color:#fff;font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:2rem 1rem}
h1{font-size:1.4rem}ul{list-style:none;padding:0}li{border-bottom:1px solid #333;padding:.8rem 0}
span{display:block;margin-bottom:.4rem;font-size:.9rem}audio{width:100%}footer{margin-top:2rem;color:#888;font-size:.75rem}</style>
</head><body><h1>${esc(doc.name)}</h1><p style="color:#888;font-size:.8rem">Shared from ATRI — ${doc.trackKeys.length} tracks</p>
<ul>${rows}</ul><footer>ATRI // local-first music</footer></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
});

// public: ranged stream of a shared track (index-based, no owner leak)
app.get("/api/share/:token/:n", async (c) => {
  const token = c.req.param("token");
  const n = parseInt(c.req.param("n"), 10);
  if (!SHARE_TOKEN.test(token) || !Number.isInteger(n) || n < 0) return c.text("Bad request", 400);
  const obj = await c.env.LIBRARY.get(`share/${token}.json`);
  if (!obj) return c.text("Not found", 404);
  const doc = (await obj.json()) as ShareDoc;
  const inner = doc.trackKeys[n];
  if (!inner || !OBJECT_KEY.test(inner)) return c.text("Not found", 404);
  const rangeHeader = c.req.header("Range");
  const range = rangeHeader ? parseRange(rangeHeader) : null;
  const audio = await c.env.LIBRARY.get(`u/${doc.ownerUid}/${inner}`, range ? { range } : undefined);
  if (!audio) return c.text("Not found", 404);
  const headers = new Headers();
  audio.writeHttpMetadata(headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(audio.size));
  if (range) {
    let offset: number;
    let length: number;
    if ("suffix" in range) {
      length = Math.min(range.suffix, audio.size);
      offset = audio.size - length;
    } else {
      offset = range.offset ?? 0;
      length = range.length ?? audio.size - offset;
    }
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${audio.size}`);
  }
  return new Response(audio.body, { status: range ? 206 : 200, headers });
});

/* ---------- account favorites ---------- */

app.get("/api/favorites", async (c) => {
  const rows = await c.env.AUTH
    .prepare("SELECT track_key FROM favorites WHERE user_id = ? ORDER BY added_at ASC")
    .bind(c.get("user").id)
    .all<{ track_key: string }>();
  return c.json({ keys: (rows.results ?? []).map((r) => r.track_key) });
});

app.put("/api/favorites", async (c) => {
  const body = await c.req.json<{ keys?: unknown }>().catch(() => null);
  if (!body || !Array.isArray(body.keys) || body.keys.some((k) => typeof k !== "string")) {
    return c.json({ error: "Body must be { keys: string[] }" }, 400);
  }
  const keys = (body.keys as string[]).slice(0, 2000);
  const uid = c.get("user").id;
  const now = Date.now();
  const stmts = [c.env.AUTH.prepare("DELETE FROM favorites WHERE user_id = ?").bind(uid)];
  for (const k of keys) {
    stmts.push(
      c.env.AUTH.prepare("INSERT OR IGNORE INTO favorites (user_id, track_key, added_at) VALUES (?, ?, ?)").bind(uid, k, now),
    );
  }
  await c.env.AUTH.batch(stmts);
  return c.json({ ok: true, count: keys.length });
});

/* ---------- account playlists ---------- */

interface CloudPlaylistRow {
  id: string;
  name: string;
  trackKeys: string[];
  updatedAt: number;
}

app.get("/api/playlists", async (c) => {
  const rows = await c.env.AUTH
    .prepare("SELECT id, name, track_keys, updated_at FROM playlists WHERE user_id = ? ORDER BY name ASC")
    .bind(c.get("user").id)
    .all<{ id: string; name: string; track_keys: string; updated_at: number }>();
  const playlists: CloudPlaylistRow[] = (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    trackKeys: JSON.parse(r.track_keys) as string[],
    updatedAt: r.updated_at,
  }));
  return c.json({ playlists });
});

app.put("/api/playlists", async (c) => {
  const body = await c.req.json<{ playlists?: unknown }>().catch(() => null);
  if (!body || !Array.isArray(body.playlists)) return c.json({ error: "Body must be { playlists: [...] }" }, 400);
  const input = body.playlists as CloudPlaylistRow[];
  if (input.length > 100) return c.json({ error: "Too many playlists" }, 400);
  for (const p of input) {
    if (!p || typeof p.id !== "string" || typeof p.name !== "string" || !Array.isArray(p.trackKeys)) {
      return c.json({ error: "Playlist must be { id, name, trackKeys[] }" }, 400);
    }
  }
  const uid = c.get("user").id;
  const now = Date.now();
  const stmts = [c.env.AUTH.prepare("DELETE FROM playlists WHERE user_id = ?").bind(uid)];
  for (const p of input.slice(0, 100)) {
    stmts.push(
      c.env.AUTH
        .prepare("INSERT OR REPLACE INTO playlists (id, user_id, name, track_keys, updated_at) VALUES (?, ?, ?, ?, ?)")
        .bind(p.id, uid, p.name.slice(0, 80), JSON.stringify(p.trackKeys.slice(0, 2000)), p.updatedAt || now),
    );
  }
  await c.env.AUTH.batch(stmts);
  return c.json({ ok: true, count: input.length });
});

/* ---------- remote downloads (Cobalt-compatible API) ---------- */

/** public http/https only — no localhost/LAN/metadata endpoints */
function validatePublicUrl(raw: string): { url: URL } | { error: string; message: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { error: "invalid_url", message: "Paste a valid http(s) link" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { error: "invalid_protocol", message: "Only http(s) links are supported" };
  }
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.0\.0\.0$/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  ) {
    return { error: "private_host", message: "Private/local addresses are not allowed" };
  }
  return { url: u };
}

app.post("/api/library/remote-download", sessionAuth, async (c) => {
  if (!c.env.DL_BASE) {
    return c.json({ error: "remote downloads are not configured on this worker" }, 503);
  }
  const body = await c.req.json<{ url?: string }>().catch(() => null);
  const raw = body?.url ?? "";
  const verdict = validatePublicUrl(raw);
  if ("error" in verdict) return c.json({ error: verdict.error, message: verdict.message }, 400);
  const target = verdict.url;
  if (/(^|\.)spotify\.com$/.test(target.hostname)) {
    return c.json(
      { error: "spotify_drm", message: "Spotify is DRM-protected — find the track on YouTube instead" },
      422,
    );
  }

  // ask the Cobalt-compatible downloader for an audio tunnel
  const dlHeaders: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (c.env.DL_KEY) dlHeaders.Authorization = `Api-Key ${c.env.DL_KEY}`;
  let mediaUrl = "";
  let filename = "";
  try {
    const r = await fetch(c.env.DL_BASE.replace(/\/+$/, ""), {
      method: "POST",
      headers: dlHeaders,
      body: JSON.stringify({ url: target.href, downloadMode: "audio", filenameStyle: "basic" }),
    });
    const data = (await r.json().catch(() => ({}))) as {
      status?: string;
      url?: string;
      filename?: string;
      error?: { code?: string };
    };
    if (data.status === "picker") {
      return c.json({ error: "picker", message: "This link returned multiple formats — paste a direct track link" }, 422);
    }
    if (data.status !== "tunnel" && data.status !== "redirect") {
      const msg = data.error?.code ?? `downloader responded ${r.status}`;
      return c.json({ error: "download_failed", message: msg }, 502);
    }
    mediaUrl = data.url ?? "";
    filename = data.filename ?? "";
  } catch (e) {
    return c.json({ error: "downloader_unreachable", message: String(e).slice(0, 120) }, 502);
  }
  if (!mediaUrl) return c.json({ error: "download_failed", message: "downloader returned no media url" }, 502);

  // best-effort YouTube metadata (title/channel/thumbnail)
  let title = "";
  let artist = "";
  let thumbnailUrl = "";
  if (/youtube\.com$|youtu\.be$/.test(target.hostname.replace(/^www\./, ""))) {
    try {
      const oe = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(target.href));
      if (oe.ok) {
        const data = (await oe.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
        title = data.title ?? "";
        artist = data.author_name ?? "";
        thumbnailUrl = data.thumbnail_url ?? "";
      }
    } catch {
      /* metadata is best-effort */
    }
  }
  const ext = (filename.split(".").pop() ?? "mp3").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "mp3";
  const baseName = (title || filename.replace(/\.[^.]+$/, "") || "remote-track").slice(0, 120);
  const safe = baseName.replace(/[^A-Za-z0-9 ._\-]/g, "").trim() || "remote-track";
  const rand = crypto.randomUUID().slice(0, 8);
  const inner = `audio/_remote/${rand}-${safe}.${ext}`;
  const key = `u/${c.get("user").id}/${inner}`;

  // stream the media body straight into the user's R2 namespace
  let media: Response;
  try {
    media = await fetch(mediaUrl);
  } catch (e) {
    return c.json({ error: "download_failed", message: `media fetch failed: ${String(e).slice(0, 120)}` }, 502);
  }
  if (!media.ok || !media.body) {
    return c.json({ error: "download_failed", message: `media fetch failed (${media.status})` }, 502);
  }
  // buffer to a fixed length — R2 put (and the local simulator) rejects
  // streams of unknown length
  const audio = new Uint8Array(await media.arrayBuffer());
  if (audio.length === 0) {
    return c.json({ error: "download_failed", message: "downloader returned an empty file" }, 502);
  }
  await c.env.LIBRARY.put(key, audio, {
    httpMetadata: { contentType: media.headers.get("Content-Type") ?? "application/octet-stream" },
  });

  return c.json({ ok: true, key: inner, title: baseName, artist, thumbnailUrl, ext });
});

/* ---------- stream: dual auth (session → u/<uid>/, legacy token → root) ---------- */

app.get("/api/stream/*", async (c) => {
  const token = bearerOrQueryToken(c);
  let prefix = "";
  if (token) {
    const user = await userForToken(c.env.AUTH, token);
    if (user) {
      prefix = `u/${user.id}/`;
    } else if (!c.env.AUTH_TOKEN || token !== c.env.AUTH_TOKEN) {
      return c.json({ error: "Unauthorized" }, 401);
    }
  } else {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const key = prefix + keyAfter(c.req.path, "/api/stream/");
  if (!OBJECT_KEY.test(key.replace(/^u\/[^/]+\//, ""))) return c.text("Bad key", 400);
  const rangeHeader = c.req.header("Range");
  const range = rangeHeader ? parseRange(rangeHeader) : null;
  const obj = await c.env.LIBRARY.get(key, range ? { range } : undefined);
  if (!obj) return c.text("Not found", 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", obj.httpEtag);
  if (range) {
    let offset: number;
    let length: number;
    if ("suffix" in range) {
      length = Math.min(range.suffix, obj.size);
      offset = obj.size - length;
    } else {
      offset = range.offset ?? 0;
      length = range.length ?? obj.size - offset;
    }
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
  }
  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { status: range ? 206 : 200, headers });
});

/* ---------- legacy shared-token mode (advanced) ---------- */

const legacyAuth: MiddlewareHandler = async (c, next) => {
  const token = bearerOrQueryToken(c);
  if (!c.env.AUTH_TOKEN || token !== c.env.AUTH_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
};

app.use("/api/manifest", legacyAuth);
app.use("/api/upload/*", legacyAuth);
app.use("/api/object/*", legacyAuth);

app.get("/api/manifest", async (c) => {
  const obj = await c.env.LIBRARY.get("manifest.json");
  if (!obj) return c.json({ version: 1, updatedAt: 0, tracks: [] });
  return new Response(obj.body, {
    headers: { "Content-Type": "application/json", ETag: obj.httpEtag },
  });
});

app.put("/api/manifest", async (c) => {
  const body = await c.req.text();
  try {
    const parsed = JSON.parse(body) as { tracks?: unknown };
    if (!Array.isArray(parsed.tracks)) return c.text("Manifest must contain tracks[]", 400);
  } catch {
    return c.text("Manifest must be valid JSON", 400);
  }
  await c.env.LIBRARY.put("manifest.json", body, {
    httpMetadata: { contentType: "application/json" },
  });
  return c.json({ ok: true });
});

app.put("/api/upload/*", async (c) => {
  const key = keyAfter(c.req.path, "/api/upload/");
  if (!OBJECT_KEY.test(key)) return c.text("Bad key — must be audio/… or cover/…", 400);
  const body = c.req.raw.body;
  if (!body) return c.text("Empty body", 400);
  await c.env.LIBRARY.put(key, body, {
    httpMetadata: { contentType: c.req.header("Content-Type") ?? "application/octet-stream" },
  });
  return c.json({ ok: true, key });
});

app.delete("/api/object/*", async (c) => {
  const key = keyAfter(c.req.path, "/api/object/");
  if (!OBJECT_KEY.test(key)) return c.text("Bad key", 400);
  await c.env.LIBRARY.delete(key);
  return c.json({ ok: true });
});

app.notFound((c) => c.text("Not found", 404));

export default app;
