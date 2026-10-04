import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMediaUrl } from "./validate.mjs";

/**
 * ATORI companion: a tiny local helper that lets the web app add songs from
 * streaming links by shelling out to yt-dlp. Zero dependencies.
 *
 *   npm run companion        (then add tracks from the library's ADD URL panel)
 *
 * Endpoints:
 *   GET  /api/health          → { ok, ytdlp: version|null, updatedAt, update }
 *   POST /api/search {query}  → YouTube search results via yt-dlp
 *   POST /api/playlist {url}  → expand a playlist URL into track entries
 *   POST /api/download {url}  → downloads bestaudio, streams the file back with
 *                               an X-Atori-Meta header carrying the metadata.
 *   POST /api/update          → force a yt-dlp self-update check now
 *
 * The desktop shell spawns this helper itself (see src-tauri/src/lib.rs), so
 * `npm run companion` is only needed when driving the web build standalone.
 *
 * Security: URLs are validated (http/https, public hosts only: see
 * validate.mjs) and passed to yt-dlp as a single argv, never through a shell.
 */

const PORT = Number(process.env.PORT || 8790);
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const SEARCH_TIMEOUT_MS = 20 * 1000;
const PLAYLIST_TIMEOUT_MS = 60 * 1000;
const PLAYLIST_MAX_ENTRIES = 50;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(body);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function runYtdlp(args, timeoutMs) {
  return new Promise((resolve) => {
    void (async () => {
      const base = await resolveYtdlp();
      if (!base) return resolve({ code: -127, stdout: "", stderr: "yt-dlp is not installed (pip install yt-dlp)" });
      let child;
      try {
        child = spawn(base.cmd, [...base.prefix, ...args], { windowsHide: true });
      } catch (e) {
        return resolve({ code: -1, stdout: "", stderr: String(e) });
      }
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ code: -2, stdout, stderr: stderr + "\ntimed out" });
      }, timeoutMs);
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: String(e) });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, stderr });
      });
    })();
  });
}

let versionCache = { at: 0, value: null };
let ytdlpBase = null; // { cmd, prefix }: resolved lazily, null = not found yet

async function probe(cmd, args) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch {
      return resolve(null);
    }
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);
    }, 8000);
    child.stdout.on("data", (d) => (out += d));
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out.trim() : null);
    });
  });
}

/** Find yt-dlp: PATH first, then the bundled ./bin copy, then `python -m yt_dlp`. */
async function resolveYtdlp() {
  if (ytdlpBase) return ytdlpBase;
  const local = join(dirname(fileURLToPath(import.meta.url)), "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  const v = await probe("yt-dlp", ["--version"]);
  if (v) {
    ytdlpBase = { cmd: "yt-dlp", prefix: [] };
    versionCache = { at: Date.now(), value: v };
    return ytdlpBase;
  }
  const vl = await probe(local, ["--version"]);
  if (vl) {
    ytdlpBase = { cmd: local, prefix: [] };
    versionCache = { at: Date.now(), value: vl };
    return ytdlpBase;
  }
  const vm = await probe("python", ["-m", "yt_dlp", "--version"]);
  if (vm) {
    ytdlpBase = { cmd: "python", prefix: ["-m", "yt_dlp"] };
    versionCache = { at: Date.now(), value: vm };
    return ytdlpBase;
  }
  versionCache = { at: Date.now(), value: null };
  return null;
}

async function ytdlpVersion() {
  if (Date.now() - versionCache.at < 60_000) return versionCache.value;
  await resolveYtdlp();
  return versionCache.value;
}

/* ---------- yt-dlp self-update ----------
 *
 * yt-dlp rots fast (YouTube reshapes extractors weekly), so the companion
 * keeps it fresh on its own: a check shortly after boot, then once a day.
 * Standalone binaries self-update via `yt-dlp -U`; pip installs go through
 * pip. Afterwards the resolver is reset so the fresh build serves the next
 * request and /api/health reports the new version.
 */

const UPDATE_STARTUP_DELAY_MS = 15 * 1000;
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 3 * 60 * 1000;

let lastUpdate = null; // { at, ok, from, to, detail }

/** Full-output process runner (probe() above keeps only the version line). */
function runRaw(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch (e) {
      return resolve({ code: -1, stdout: "", stderr: String(e) });
    }
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: -2, stdout, stderr: stderr + "\ntimed out" });
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(e) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function selfUpdate() {
  const base = await resolveYtdlp();
  if (!base) return;
  const from = versionCache.value;
  const r = base.prefix.length
    ? await runRaw(
        base.cmd,
        ["-m", "pip", "install", "--upgrade", "--quiet", "--disable-pip-version-check", "yt-dlp"],
        UPDATE_TIMEOUT_MS,
      )
    : await runRaw(base.cmd, ["-U"], UPDATE_TIMEOUT_MS);
  ytdlpBase = null;
  versionCache = { at: 0, value: null };
  await resolveYtdlp();
  lastUpdate = {
    at: Date.now(),
    ok: r.code === 0,
    from,
    to: versionCache.value,
    detail: (r.stderr || r.stdout).trim().split("\n").slice(-2).join(" ").slice(0, 300),
  };
  if (versionCache.value && versionCache.value !== from) {
    console.log(`[atori-companion] yt-dlp updated ${from} → ${versionCache.value}`);
  } else if (!lastUpdate.ok) {
    console.log(`[atori-companion] yt-dlp update check failed: ${lastUpdate.detail}`);
  } else {
    console.log(`[atori-companion] yt-dlp ${versionCache.value} is up to date`);
  }
}

function scheduleUpdates() {
  setTimeout(() => {
    void selfUpdate().catch(() => {});
    setInterval(() => void selfUpdate().catch(() => {}), UPDATE_INTERVAL_MS);
  }, UPDATE_STARTUP_DELAY_MS);
}

function parseInfoJson(stdout) {
  // --print-json with --quiet emits a single JSON line; be tolerant of extra output
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]);
      if (obj && typeof obj === "object" && (obj.title || obj._filename)) return obj;
    } catch {
      // not the json line: keep looking
    }
  }
  return null;
}

async function handleSearch(res, query) {
  const q = String(query ?? "").trim().slice(0, 200);
  if (!q) return sendJson(res, 400, { error: "empty_query" });
  const { code, stdout, stderr } = await runYtdlp(
    ["--flat-playlist", "--dump-single-json", "--no-warnings", `ytsearch6:${q}`],
    SEARCH_TIMEOUT_MS,
  );
  if (code !== 0) {
    return sendJson(res, 502, { error: "search_failed", message: stderr.slice(-400) });
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return sendJson(res, 502, { error: "search_parse_failed" });
  }
  const hits = (parsed.entries ?? []).map((e) => ({
    title: e.title ?? "Untitled",
    url: e.webpage_url ?? e.url,
    uploader: e.uploader ?? e.channel ?? "",
    duration: typeof e.duration === "number" ? e.duration : null,
    thumbnail: e.thumbnail ?? e.thumbnails?.[e.thumbnails.length - 1]?.url ?? null,
  }));
  sendJson(res, 200, { hits: hits.filter((h) => h.url) });
}

async function handlePlaylist(res, rawUrl) {
  const verdict = await validateMediaUrl(String(rawUrl ?? ""));
  if (verdict.error) {
    return sendJson(res, 400, { error: verdict.error, message: "URL rejected: public http(s) links only" });
  }
  const url = verdict.url;
  if (/(^|\.)spotify\.com$/.test(url.hostname)) {
    return sendJson(res, 422, {
      error: "spotify_drm",
      message: "Spotify is DRM-protected and cannot be downloaded: find the tracks on YouTube instead",
    });
  }
  const { code, stdout, stderr } = await runYtdlp(
    ["--flat-playlist", "--dump-single-json", "--no-warnings", url.href],
    PLAYLIST_TIMEOUT_MS,
  );
  if (code !== 0) {
    return sendJson(res, 502, { error: "playlist_failed", message: stderr.slice(-400) });
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return sendJson(res, 502, { error: "playlist_parse_failed" });
  }
  const entries = (parsed.entries ?? [])
    .filter((e) => e.webpage_url || e.url)
    .slice(0, PLAYLIST_MAX_ENTRIES)
    .map((e) => ({
      title: e.title ?? "Untitled",
      url: e.webpage_url ?? e.url,
      uploader: e.uploader ?? e.channel ?? "",
      duration: typeof e.duration === "number" ? e.duration : null,
    }));
  if (entries.length === 0) {
    return sendJson(res, 422, { error: "empty_playlist", message: "No downloadable entries found" });
  }
  sendJson(res, 200, {
    title: parsed.title ?? "Playlist",
    count: entries.length,
    truncated: (parsed.entries?.length ?? 0) > entries.length,
    entries,
  });
}

async function handleDownload(res, rawUrl, format = "best") {
  format = ["best", "mp3", "opus", "wav", "mp4"].includes(format) ? format : "best";
  const verdict = await validateMediaUrl(String(rawUrl ?? ""));
  if (verdict.error) {
    return sendJson(res, 400, { error: verdict.error, message: "URL rejected: public http(s) links only" });
  }
  const url = verdict.url;
  if (/(^|\.)spotify\.com$/.test(url.hostname)) {
    return sendJson(res, 422, {
      error: "spotify_drm",
      message: "Spotify is DRM-protected and cannot be downloaded: find the track on YouTube and paste that link",
    });
  }
  const dir = await mkdtemp(join(tmpdir(), "atori-dl-"));
  try {
    // bestaudio natively (no ffmpeg needed), or extract/transcode via ffmpeg
    const wantVideo = format === "mp4";
    const fmt = wantVideo
      ? ["-f", "bv*[height<=720]+ba/b", "--merge-output-format", "mp4"]
      : format === "best"
        ? ["-f", "bestaudio[ext=m4a]/bestaudio"]
        : ["-f", "bestaudio/best", "-x", "--audio-format", format];
    const baseArgs = ["--no-playlist", "--no-part", "--no-warnings", "--quiet", "--print-json"];
    let { code, stdout, stderr } = await runYtdlp(
      [...fmt, ...baseArgs, "-o", join(dir, "audio.%(ext)s"), url.href],
      DOWNLOAD_TIMEOUT_MS,
    );
    if (code !== 0 && format !== "best") {
      // video merge or a transcode failed: usually ffmpeg missing, so retry
      // with the native bestaudio stream instead
      ({ code, stdout, stderr } = await runYtdlp(
        ["-f", "bestaudio[ext=m4a]/bestaudio", ...baseArgs, "-o", join(dir, "audio.%(ext)s"), url.href],
        DOWNLOAD_TIMEOUT_MS,
      ));
    }
    if (code !== 0) {
      const tail = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 400);
      return sendJson(res, 502, { error: "download_failed", message: tail || `yt-dlp exited ${code}` });
    }
    const info = parseInfoJson(stdout) ?? {};
    const files = (await readdir(dir)).filter((f) => f.startsWith("audio."));
    if (files.length === 0) {
      return sendJson(res, 502, { error: "download_failed", message: "no audio file produced" });
    }
    const meta = {
      title: info.title ?? files[0],
      artist: info.uploader ?? info.channel ?? "",
      duration: typeof info.duration === "number" ? info.duration : null,
      thumbnail: info.thumbnail ?? null,
      // the post-processed file is the ground truth (yt-dlp's json ext lags
      // behind -x/--audio-format transcodes)
      ext: files[0].split(".").pop() ?? info.ext ?? "m4a",
    };
    const filePath = join(dir, files[0]);
    const { stat } = await import("node:fs/promises");
    const size = (await stat(filePath)).size;
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": size,
      "X-Atori-Meta": encodeURIComponent(JSON.stringify(meta)),
      "Access-Control-Expose-Headers": "X-Atori-Meta",
    });
    await new Promise((resolve) => {
      const stream = createReadStream(filePath);
      stream.on("error", () => {
        res.destroy();
        resolve();
      });
      // client abort: destroy the reader so Windows can delete the temp dir
      res.on("close", () => {
        stream.destroy();
        resolve();
      });
      stream.pipe(res);
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ---------- Cobalt-compatible endpoint (server-side downloads) ----------
 *
 * The cloud worker's /api/library/remote-download speaks the Cobalt API:
 * POST / {url, downloadMode} → {status:"tunnel", url, filename}. This makes
 * the companion usable as the worker's DL_BASE (via a cloudflared tunnel),
 * so ADD URL works from any device while this PC is on. The worker fetches
 * data.url from Cloudflare's edge, so the file URL must be the PUBLIC base
 * (PUBLIC_BASE env = the tunnel URL): not localhost.
 */

const fileTunnels = new Map(); // id → { dir, file, filename, meta, created }
const FILE_TTL_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, t] of fileTunnels) {
    if (now - t.created > FILE_TTL_MS) {
      fileTunnels.delete(id);
      void rm(t.dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}, 5 * 60 * 1000).unref();

async function handleCobalt(res, body) {
  const publicBase = (process.env.PUBLIC_BASE ?? "").replace(/\/+$/, "");
  if (!publicBase) {
    return sendJson(res, 501, {
      status: "error",
      error: { code: "no_public_base" },
      message: "Set PUBLIC_BASE (the cloudflared tunnel URL) to serve as a remote downloader",
    });
  }
  const raw = String(body?.url ?? "");
  const wantVideo = body?.downloadMode === "auto" || body?.videoQuality !== "audio";
  const audioFormat = ["mp3", "opus", "wav", "ogg"].includes(body?.audioFormat) ? body.audioFormat : "best";
  const verdict = await validateMediaUrl(raw);
  if (verdict.error) {
    return sendJson(res, 400, { status: "error", error: { code: verdict.error } });
  }
  const url = verdict.url;
  const dir = await mkdtemp(join(tmpdir(), "atori-tun-"));
  try {
    const fmt = wantVideo
      ? ["-f", "bv*[height<=720]+ba/b", "--merge-output-format", "mp4"]
      : audioFormat === "best"
        ? ["-f", "bestaudio[ext=m4a]/bestaudio"]
        : ["-f", "bestaudio/best", "-x", "--audio-format", audioFormat];
    let { code, stdout, stderr } = await runYtdlp(
      [...fmt, "--no-playlist", "--no-part", "--no-warnings", "--quiet", "--print-json",
       "-o", join(dir, "audio.%(ext)s"), url.href],
      DOWNLOAD_TIMEOUT_MS,
    );
    if (code !== 0 && (wantVideo || audioFormat !== "best")) {
      ({ code, stdout, stderr } = await runYtdlp(
        ["-f", "bestaudio[ext=m4a]/bestaudio", "--no-playlist", "--no-part", "--no-warnings", "--quiet", "--print-json",
         "-o", join(dir, "audio.%(ext)s"), url.href],
        DOWNLOAD_TIMEOUT_MS,
      ));
    }
    if (code !== 0) {
      const tail = stderr.trim().split("\n").slice(-2).join(" ").slice(0, 200);
      return sendJson(res, 200, { status: "error", error: { code: "download_failed", tail } });
    }
    const info = parseInfoJson(stdout) ?? {};
    const files = (await readdir(dir)).filter((f) => f.startsWith("audio."));
    if (files.length === 0) {
      return sendJson(res, 200, { status: "error", error: { code: "no_output" } });
    }
    const filename = `${(info.title ?? "atori-track").slice(0, 100)}.${info.ext ?? files[0].split(".").pop() ?? "m4a"}`
      .replace(/[^A-Za-z0-9 ._-]/g, "_");
    const id = crypto.randomUUID();
    fileTunnels.set(id, { dir, file: files[0], filename, created: Date.now() });
    return sendJson(res, 200, {
      status: "tunnel",
      url: `${publicBase}/f/${id}`,
      filename,
    });
  } catch (e) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    return sendJson(res, 200, { status: "error", error: { code: String(e).slice(0, 80) } });
  }
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  try {
    if (req.method === "GET" && req.url === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        ytdlp: await ytdlpVersion(),
        updatedAt: lastUpdate?.at ?? null,
        update: lastUpdate,
      });
    }
    if (req.method === "POST" && req.url === "/api/update") {
      await selfUpdate();
      return sendJson(res, 200, { ok: lastUpdate?.ok ?? false, update: lastUpdate });
    }
    if (req.method === "POST" && req.url === "/api/search") {
      const body = JSON.parse((await readBody(req)) || "{}");
      return await handleSearch(res, body.query);
    }
    if (req.method === "POST" && req.url === "/api/playlist") {
      const body = JSON.parse((await readBody(req)) || "{}");
      return await handlePlaylist(res, body.url);
    }
    if (req.method === "POST" && req.url === "/api/download") {
      const body = JSON.parse((await readBody(req)) || "{}");
      return await handleDownload(res, body.url, body.format);
    }
    // Cobalt-compatible contract: the cloud worker's DL_BASE target
    if (req.method === "POST" && req.url === "/") {
      const body = JSON.parse((await readBody(req)) || "{}");
      cors(res);
      return await handleCobalt(res, body);
    }
    if (req.method === "GET" && req.url?.startsWith("/f/")) {
      const id = req.url.slice(3);
      const t = fileTunnels.get(id);
      if (!t) {
        res.writeHead(404);
        return res.end("expired");
      }
      const filePath = join(t.dir, t.file);
      const { stat } = await import("node:fs/promises");
      const size = (await stat(filePath)).size;
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": size,
        "Content-Disposition": `attachment; filename="${t.filename}"`,
      });
      return void new Promise((resolve) => {
        const stream = createReadStream(filePath);
        stream.on("error", () => {
          res.destroy();
          resolve();
        });
        res.on("close", () => {
          stream.destroy();
          resolve();
        });
        stream.pipe(res);
      });
    }
    sendJson(res, 404, { error: "not_found" });
  } catch (e) {
    if (!res.headersSent) sendJson(res, 500, { error: "internal", message: String(e?.message ?? e) });
    else res.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`[atori-companion] listening on http://localhost:${PORT}`);
  void ytdlpVersion().then((v) =>
    console.log(v ? `[atori-companion] yt-dlp ${v}` : "[atori-companion] yt-dlp NOT FOUND (install it with: pip install yt-dlp)"),
  );
  scheduleUpdates();
});
