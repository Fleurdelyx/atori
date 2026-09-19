import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMediaUrl } from "./validate.mjs";

/**
 * ATRI companion — a tiny local helper that lets the web app add songs from
 * streaming links by shelling out to yt-dlp. Zero dependencies.
 *
 *   npm run companion        (then add tracks from the library's ADD URL panel)
 *
 * Endpoints:
 *   GET  /api/health          → { ok, ytdlp: version|null }
 *   POST /api/search {query}  → YouTube search results via yt-dlp
 *   POST /api/playlist {url}  → expand a playlist URL into track entries
 *   POST /api/download {url}  → downloads bestaudio, streams the file back with
 *                               an X-Atori-Meta header carrying the metadata.
 *
 * Security: URLs are validated (http/https, public hosts only — see
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
let ytdlpBase = null; // { cmd, prefix } — resolved lazily, null = not found yet

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

function parseInfoJson(stdout) {
  // --print-json with --quiet emits a single JSON line; be tolerant of extra output
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]);
      if (obj && typeof obj === "object" && (obj.title || obj._filename)) return obj;
    } catch {
      // not the json line — keep looking
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
    return sendJson(res, 400, { error: verdict.error, message: "URL rejected — public http(s) links only" });
  }
  const url = verdict.url;
  if (/(^|\.)spotify\.com$/.test(url.hostname)) {
    return sendJson(res, 422, {
      error: "spotify_drm",
      message: "Spotify is DRM-protected and cannot be downloaded — find the tracks on YouTube instead",
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

async function handleDownload(res, rawUrl, wantVideo = false) {
  const verdict = await validateMediaUrl(String(rawUrl ?? ""));
  if (verdict.error) {
    return sendJson(res, 400, { error: verdict.error, message: "URL rejected — public http(s) links only" });
  }
  const url = verdict.url;
  if (/(^|\.)spotify\.com$/.test(url.hostname)) {
    return sendJson(res, 422, {
      error: "spotify_drm",
      message: "Spotify is DRM-protected and cannot be downloaded — find the track on YouTube and paste that link",
    });
  }
  const dir = await mkdtemp(join(tmpdir(), "atori-dl-"));
  try {
    // video mode needs ffmpeg to merge video+audio; fall back to audio-only
    const fmt = wantVideo
      ? ["-f", "bv*[height<=720]+ba/b", "--merge-output-format", "mp4"]
      : ["-f", "bestaudio[ext=m4a]/bestaudio"];
    let { code, stdout, stderr } = await runYtdlp(
      [
        ...fmt,
        "--no-playlist",
        "--no-part",
        "--no-warnings",
        "--quiet",
        "--print-json",
        "-o", join(dir, "audio.%(ext)s"),
        url.href,
      ],
      DOWNLOAD_TIMEOUT_MS,
    );
    if (code !== 0 && wantVideo) {
      // likely ffmpeg missing — retry as plain audio
      ({ code, stdout, stderr } = await runYtdlp(
        [
          "-f", "bestaudio[ext=m4a]/bestaudio",
          "--no-playlist",
          "--no-part",
          "--no-warnings",
          "--quiet",
          "--print-json",
          "-o", join(dir, "audio.%(ext)s"),
          url.href,
        ],
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
      ext: info.ext ?? files[0].split(".").pop() ?? "m4a",
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
      stream.pipe(res);
      stream.on("error", () => {
        res.destroy();
        resolve();
      });
      res.on("close", resolve);
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
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
      return sendJson(res, 200, { ok: true, ytdlp: await ytdlpVersion() });
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
      return await handleDownload(res, body.url, body.video === true);
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
    console.log(v ? `[atori-companion] yt-dlp ${v}` : "[atori-companion] yt-dlp NOT FOUND — install it with: pip install yt-dlp"),
  );
});
