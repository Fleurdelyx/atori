import type { TrackMeta } from "@/core/library/types";
import { gradeFor } from "@/core/library/types";
import { useUi } from "@/state/uiStore";
import { accountCfg, useAuth } from "@/core/auth/authStore";

/**
 * CloudService — client for the atori-cloud Worker (Cloudflare R2).
 * Manifest sync (upload library metadata + audio), streaming URLs,
 * and an offline cache over the Cache API.
 *
 * Two access modes share these helpers:
 *  - "account": a signed-in user (authStore) — user-scoped /api/library/*
 *    endpoints, session token as Bearer / ?token=.
 *  - "legacy": the advanced self-host mode — one shared token, /api/* paths.
 */

export interface CloudManifestTrack {
  key: string;
  coverKey: string | null;
  lyrics: string | null;
  title: string;
  artist: string;
  artists: string[];
  album: string;
  albumArtist: string;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  genre: string[];
  duration: number;
  format: string;
  bitrate: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  lossless: boolean;
  size: number;
}

export interface CloudManifest {
  version: number;
  updatedAt: number;
  tracks: CloudManifestTrack[];
}

/** thrown on HTTP 401 so callers can prompt re-auth instead of generic failure */
export class CloudAuthError extends Error {
  constructor(message = "Session expired") {
    super(message);
    this.name = "CloudAuthError";
  }
}

const CACHE_NAME = "atori-cloud-v2";

export type CloudMode = "account" | "legacy";

export function cloudMode(): CloudMode {
  return accountCfg() ? "account" : "legacy";
}

interface CloudCfg {
  base: string;
  token: string;
  mode: CloudMode;
}

function cfg(): CloudCfg {
  const account = accountCfg();
  if (account) return { ...account, mode: "account" };
  const s = useUi.getState();
  return { base: s.cloudUrl.trim().replace(/\/+$/, ""), token: s.cloudToken, mode: "legacy" };
}

function headers(withAuth = true): HeadersInit {
  return withAuth ? { Authorization: `Bearer ${cfg().token}` } : {};
}

/**
 * Validate + normalize an endpoint URL. Returns null unless it is a usable
 * absolute http(s) URL — without this, `fetch("not-a-url/api/health")`
 * resolves relative to the app origin and can report a false CONNECTED.
 */
export function normalizeCloudUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !parsed.hostname) return null;
  } catch {
    return null;
  }
  return trimmed;
}

export function cloudConfigured(): boolean {
  const { base, token } = cfg();
  return normalizeCloudUrl(base) !== null && token.length > 0;
}

export function keyForSegment(seg: string): string {
  return seg
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
}

/** manifest endpoint differs per mode; stream/object keys are the same path */
function manifestPath(): string {
  return cloudMode() === "account" ? "/api/library/manifest" : "/api/manifest";
}

function uploadPath(): string {
  return cloudMode() === "account" ? "/api/library/upload/" : "/api/upload/";
}

function objectPath(): string {
  return cloudMode() === "account" ? "/api/library/object/" : "/api/object/";
}

export function streamUrlFor(key: string): string {
  const { base, token } = cfg();
  return `${base}/api/stream/${keyForSegment(key)}?token=${encodeURIComponent(token)}`;
}

/** Cover-art objects live under cover/<coverKey> in the bucket. */
export function cloudCoverUrl(coverKey: string): string {
  return streamUrlFor(`cover/${coverKey}`);
}

/**
 * Stable Cache API key for an object. The real stream URL embeds a
 * credential, so keying the offline cache on it would orphan entries
 * whenever the token/session changes. This logical URL never changes for
 * a given user+key (or shared+key in legacy mode).
 */
function cacheKeyFor(key: string): string {
  const uid = cloudMode() === "account" ? (useAuth.getState().user?.id ?? "anon") : "shared";
  return `https://atori-cache.local/${uid}/${key}`;
}

export async function testConnection(url: string, token: string): Promise<{ ok: boolean; message: string }> {
  const target = normalizeCloudUrl(url);
  if (!target) return { ok: false, message: "INVALID URL — USE http(s)://HOST" };
  if (!token.trim()) return { ok: false, message: "TOKEN REQUIRED" };
  try {
    const res = await fetch(`${target}/api/health`, {
      headers: { Authorization: `Bearer ${token.trim()}` },
    });
    if (res.ok) return { ok: true, message: "CONNECTED" };
    if (res.status === 401) return { ok: false, message: "UNAUTHORIZED — CHECK TOKEN" };
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: `UNREACHABLE — ${String(e).slice(0, 60)}` };
  }
}

export async function fetchManifest(): Promise<CloudManifest> {
  const { base } = cfg();
  const res = await fetch(`${base}${manifestPath()}`, { headers: headers() });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`manifest fetch failed: HTTP ${res.status}`);
  return (await res.json()) as CloudManifest;
}

export async function putManifest(m: CloudManifest): Promise<void> {
  const { base, token } = cfg();
  const res = await fetch(`${base}${manifestPath()}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(m),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`manifest write failed: HTTP ${res.status}`);
}

/* ---------- resume state (continue listening on any device) ---------- */

export interface ResumeState {
  track: TrackMeta;
  pos: number;
  savedAt: number;
}

/** The signed-in account's last-played snapshot (null when none/legacy mode). */
export async function fetchResume(): Promise<ResumeState | null> {
  if (cloudMode() !== "account" || !cloudConfigured()) return null;
  const { base } = cfg();
  const res = await fetch(`${base}/api/library/resume`, { headers: headers() });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) return null;
  const data = (await res.json()) as Partial<ResumeState>;
  if (!data.track || typeof data.savedAt !== "number" || data.savedAt <= 0) return null;
  return data as ResumeState;
}

/** Push the last-played snapshot; account mode only, best-effort by caller. */
export async function putResume(state: ResumeState): Promise<void> {
  if (cloudMode() !== "account" || !cloudConfigured()) return;
  const { base, token } = cfg();
  const res = await fetch(`${base}/api/library/resume`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`resume write failed: HTTP ${res.status}`);
}

/** Public read-only share link for a cloud playlist (account mode only). */
export async function createShare(name: string, trackKeys: string[]): Promise<string> {
  if (cloudMode() !== "account") throw new Error("Sharing needs a signed-in account");
  const { base, token } = cfg();
  const res = await fetch(`${base}/api/library/share`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, trackKeys }),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`share failed: HTTP ${res.status}`);
  const data = (await res.json()) as { token: string };
  return `${base}/s/${data.token}`;
}

export function manifestToTracks(m: CloudManifest): TrackMeta[] {  return m.tracks.map((t) => ({
    id: hashKey(t.key),
    path: t.key,
    fileName: t.key.split("/").pop() ?? t.key,
    title: t.title,
    artist: t.artist,
    artists: t.artists,
    album: t.album,
    albumArtist: t.albumArtist,
    trackNo: t.trackNo,
    discNo: t.discNo,
    year: t.year,
    genre: t.genre,
    duration: t.duration,
    format: t.format,
    bitrate: t.bitrate,
    sampleRate: t.sampleRate,
    bitDepth: t.bitDepth,
    lossless: t.lossless,
    grade: gradeFor(t.format, t.bitrate, t.lossless),
    coverKey: t.coverKey,
    lyrics: t.lyrics ?? undefined,
    playable: true,
    source: "cloud",
    addedAt: m.updatedAt,
    playCount: 0,
    lastPlayedAt: null,
  }));
}

function hashKey(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return h >>> 0;
}

/* ---------- upload / sync ---------- */

export interface SyncProgress {
  done: number;
  total: number;
  current: string;
}

/** Object key for a track's audio file. */
export function objectKeyFor(t: TrackMeta): string {
  const clean = (s: string) => s.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim() || "Unknown";
  return `audio/${clean(t.albumArtist)}/${clean(t.album)}/${clean(t.fileName)}`;
}

export async function syncLibraryUp(
  tracks: TrackMeta[],
  resolveFile: (track: TrackMeta) => Promise<File | null>,
  onProgress?: (p: SyncProgress) => void,
  resolveCover?: (coverKey: string) => Promise<Blob | null>,
): Promise<{ uploaded: number; failed: number }> {
  const { base } = cfg();
  let uploaded = 0;
  let failed = 0;
  const coversDone = new Set<string>();

  const manifestTracks: CloudManifestTrack[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const key = objectKeyFor(t);
    onProgress?.({ done: i, total: tracks.length, current: t.fileName });
    try {
      const file = await resolveFile(t);
      if (!file) {
        failed++;
        continue;
      }
      const res = await fetch(`${base}${uploadPath()}${keyForSegment(key)}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${cfg().token}`, "Content-Type": "application/octet-stream" },
        body: file,
      });
      if (res.status === 401) throw new CloudAuthError();
      if (!res.ok) {
        failed++;
        continue;
      }
      // ship the album cover once per album
      if (t.coverKey && !coversDone.has(t.coverKey) && resolveCover) {
        const blob = await resolveCover(t.coverKey);
        if (blob) {
          const cres = await fetch(`${base}${uploadPath()}cover/${keyForSegment(t.coverKey)}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${cfg().token}`, "Content-Type": blob.type || "image/png" },
            body: blob,
          });
          if (cres.ok) coversDone.add(t.coverKey);
        }
      }
      uploaded++;
      manifestTracks.push({
        key,
        coverKey: coversDone.has(t.coverKey ?? "") ? (t.coverKey ?? null) : null,
        lyrics: t.lyrics ?? null,
        title: t.title,
        artist: t.artist,
        artists: t.artists,
        album: t.album,
        albumArtist: t.albumArtist,
        trackNo: t.trackNo,
        discNo: t.discNo,
        year: t.year,
        genre: t.genre,
        duration: t.duration,
        format: t.format,
        bitrate: t.bitrate,
        sampleRate: t.sampleRate,
        bitDepth: t.bitDepth,
        lossless: t.lossless,
        size: file.size,
      });
    } catch (e) {
      if (e instanceof CloudAuthError) throw e;
      failed++;
    }
  }

  onProgress?.({ done: tracks.length, total: tracks.length, current: "Writing manifest…" });
  const manifest: CloudManifest = {
    version: 1,
    updatedAt: Date.now(),
    tracks: manifestTracks,
  };
  const res = await fetch(`${base}${manifestPath()}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${cfg().token}`, "Content-Type": "application/json" },
    body: JSON.stringify(manifest),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`manifest write failed: HTTP ${res.status}`);
  return { uploaded, failed };
}

/* ---------- offline cache (Cache API) ---------- */

export async function cacheTrack(key: string): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = cacheKeyFor(key);
    if (await cache.match(cacheKey)) return true;
    const res = await fetch(streamUrlFor(key));
    if (res.status === 401) throw new CloudAuthError();
    if (!res.ok) return false;
    await cache.put(cacheKey, res.clone());
    return true;
  } catch (e) {
    if (e instanceof CloudAuthError) throw e;
    return false;
  }
}

export async function cachedTrackUrl(key: string): Promise<string | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheKeyFor(key));
    if (!hit) return null;
    const blob = await hit.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function isCached(key: string): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME);
    return !!(await cache.match(cacheKeyFor(key)));
  } catch {
    return false;
  }
}
