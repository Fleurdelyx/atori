import type { TrackMeta } from "@/core/library/types";
import { gradeFor } from "@/core/library/types";
import { useUi } from "@/state/uiStore";
import { accountCfg, useAuth } from "@/core/auth/authStore";
import { DEFAULT_SERVER_URL, defaultServerConfigured } from "./defaults";

/**
 * CloudService: client for the atori-cloud Worker (Cloudflare R2).
 * Manifest sync (upload library metadata + audio), streaming URLs,
 * and an offline cache over the Cache API.
 *
 * Two access modes share these helpers:
 *  - "account": a signed-in user (authStore); user-scoped /api/library/*
 *    endpoints, session token as Bearer / ?token=.
 *  - "legacy": the advanced self-host mode (one shared token, /api/* paths).
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
 * absolute http(s) URL: without this, `fetch("not-a-url/api/health")`
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
  // OFFLINE mode is a hard off-switch: no server anywhere in the app
  if (useUi.getState().offlineMode) return false;
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

/** Cover-art objects live under cover/<coverKey> in the bucket; catalogue
 *  manifest entries carry absolute catalogue/cover/… keys, which stream as-is.
 *  Signed-in sessions embed the stream token; anonymous sessions can only
 *  read the shared catalogue's public keys (same rule as track streaming). */
export function coverStreamUrl(coverKey: string): string | null {
  const inner = coverKey.startsWith("catalogue/") ? coverKey : `cover/${coverKey}`;
  if (cloudConfigured()) return streamUrlFor(inner);
  if (inner.startsWith("catalogue/") && catalogueReady()) return anonymousStreamUrl(inner);
  return null;
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
  if (!target) return { ok: false, message: "INVALID URL: USE http(s)://HOST" };
  if (!token.trim()) return { ok: false, message: "TOKEN REQUIRED" };
  try {
    const res = await fetch(`${target}/api/health`, {
      headers: { Authorization: `Bearer ${token.trim()}` },
    });
    if (res.ok) return { ok: true, message: "CONNECTED" };
    if (res.status === 401) return { ok: false, message: "UNAUTHORIZED: CHECK TOKEN" };
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: `UNREACHABLE: ${String(e).slice(0, 60)}` };
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

/* ---------- shared catalogue (server mode) ----------
 * Admin-curated tracks every signed-in account can browse, search and
 * stream. Manifest keys are absolute (catalogue/audio/…); streaming goes
 * through the same /api/stream route, which serves catalogue/ keys to any
 * session. */

export async function fetchCatalogueManifest(): Promise<CloudManifest> {
  // anonymous players read the public mirror; signed-in sessions use the
  // authenticated route (same manifest on the server)
  const anon = !accountCfg();
  const base = catalogueBase();
  const res = await fetch(`${base}${anon ? "/api/catalogue/public" : "/api/catalogue/manifest"}`, {
    headers: anon ? {} : headers(),
  });
  if (!anon && res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`catalogue manifest fetch failed: HTTP ${res.status}`);
  return (await res.json()) as CloudManifest;
}

export async function putCatalogueManifest(m: CloudManifest): Promise<void> {
  const { base, token } = cfg();
  const res = await fetch(`${base}/api/catalogue/manifest`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(m),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`catalogue manifest write failed: HTTP ${res.status}`);
}

/** Admin: remove tracks from the shared catalogue (objects + manifest prune). */
export async function deleteCatalogueTracks(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const { base, token } = cfg();
  const res = await fetch(`${base}/api/catalogue/delete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ keys }),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) return 0;
  const { deleted } = (await res.json()) as { deleted: number };
  return deleted;
}

/** Admin-curated playlist over catalogue track keys (absolute catalogue/…). */
export interface CataloguePlaylist {
  id: string;
  name: string;
  trackKeys: string[];
  /** custom cover, an absolute catalogue/cover/… key (null = collage) */
  picKey?: string | null;
  createdAt: number;
  updatedAt: number;
}

export async function fetchCataloguePlaylists(): Promise<CataloguePlaylist[]> {
  // catalogueBase, not cfg(): the playlists GET is public, so signed-out
  // visitors (empty cfg base) must still hit the remembered/default server
  const authed = accountCfg() !== null;
  const res = await fetch(`${catalogueBase()}/api/catalogue/playlists`, {
    headers: authed ? headers() : {},
  });
  if (authed && res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`catalogue playlists fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as { playlists?: CataloguePlaylist[] };
  return data.playlists ?? [];
}

/** Admin-only on the server (the route rejects non-admin writes). */
export async function putCataloguePlaylists(playlists: CataloguePlaylist[]): Promise<void> {
  const { base, token } = cfg();
  const res = await fetch(`${base}/api/catalogue/playlists`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version: 1, updatedAt: Date.now(), playlists }),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`catalogue playlists write failed: HTTP ${res.status}`);
}

/** Upload a custom cover for a catalogue playlist; returns the stored key.
 *  The key embeds a version stamp: the cover cache is keyed by object key,
 *  so re-uploading under an unchanged key would keep serving the old image. */
export async function putCataloguePlaylistPic(id: string, blob: Blob): Promise<string> {
  const { base, token } = cfg();
  const safe = id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  const key = `cover/pl-${safe}-${Date.now().toString(36)}.png`;
  const res = await fetch(`${base}/api/catalogue/upload/${keyForSegment(key)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": blob.type || "image/png" },
    body: blob,
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`playlist picture upload failed: HTTP ${res.status}`);
  return `catalogue/${key}`;
}

/** true when the signed-in account may manage the shared catalogue */
export function isAdminUser(): boolean {
  return Boolean(useAuth.getState().user?.isAdmin);
}

/** catalogue membership follows the SONG: the merged track may be the local
 *  or personal copy of a song that also lives in the shared catalogue */
export function isCatalogueTrack(t: { path: string; inCatalogue?: boolean }): boolean {
  return t.inCatalogue === true || t.path.startsWith("catalogue/");
}

/** catalogue routes need a usable server: signed-in (account mode), or the
 *  compiled-in/remembered server for anonymous browsing — and the user
 *  hasn't disabled the shared catalogue or gone offline */
export function catalogueReady(): boolean {
  const ui = useUi.getState();
  if (ui.offlineMode || !ui.catalogueEnabled) return false;
  if (cloudMode() === "account") return true;
  // anonymous: a base URL is known (remembered server or the default one)
  return Boolean(useAuth.getState().serverUrl || defaultServerConfigured());
}

/** base URL catalogue requests go to: the signed-in server, else the
 *  remembered/default one for anonymous browsing */
export function catalogueBase(): string {
  const remembered = useAuth.getState().serverUrl.trim().replace(/\/+$/, "");
  if (remembered) return remembered;
  return DEFAULT_SERVER_URL.trim().replace(/\/+$/, "");
}

/** stream URL for catalogue tracks without a session (public keys) */
export function anonymousStreamUrl(path: string): string {
  return `${catalogueBase()}/api/stream/${keyForSegment(path)}`;
}

/** where an upload lands: the user's own namespace, or the shared catalogue */
interface UploadTarget {
  uploadPrefix: string;
  mpPrefix: string;
  fetchManifest: () => Promise<CloudManifest>;
  putManifest: (m: CloudManifest) => Promise<void>;
  /** catalogue manifest keys are absolute; user keys stay relative */
  keyPrefix: string;
}

function uploadTarget(scope: "user" | "catalogue"): UploadTarget {
  return scope === "catalogue"
    ? {
        uploadPrefix: "/api/catalogue/upload/",
        mpPrefix: "/api/catalogue/upload-mp",
        fetchManifest: fetchCatalogueManifest,
        putManifest: putCatalogueManifest,
        keyPrefix: "catalogue/",
      }
    : {
        uploadPrefix: uploadPath(),
        mpPrefix: "/api/library/upload-mp",
        fetchManifest,
        putManifest,
        keyPrefix: "",
      };
}

/**
 * Manifest writes are read-modify-write cycles with no server-side locking:
 * two concurrent writers (an ADD URL landing during a library sync, two tabs)
 * lose one side's tracks. Serialize every cycle through this queue.
 */
let manifestLock: Promise<unknown> = Promise.resolve();

export function withManifestLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = manifestLock.then(fn, fn);
  manifestLock = run.catch(() => {});
  return run;
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

/** Resolve a track's source file: the FS-Access handle when permitted, else
 *  the stored blob. Shared by the cloud sync UI. */
export async function resolveSourceFile(t: TrackMeta): Promise<File | null> {
  const { db } = await import("@/core/library/db");
  const src = await db.sources.get(t.path);
  if (!src) return null;
  if (src.handle) {
    const h = src.handle as FileSystemFileHandle & {
      queryPermission?: (d: { mode: string }) => Promise<PermissionState>;
    };
    try {
      const state = (await h.queryPermission?.({ mode: "read" })) ?? "granted";
      if (state === "granted") return await src.handle.getFile();
    } catch {
      /* fall through to the stored blob */
    }
  }
  return src.file ?? null;
}

/** Cloudflare's proxy rejects request bodies over ~100MB: stay under, and
 *  slice anything bigger through R2 multipart instead. */
const DIRECT_UPLOAD_LIMIT = 95 * 1024 * 1024;

/**
 * Upload one file, falling back to R2 multipart (init → parts → complete)
 * when it exceeds the proxy's single-request body cap. Returns true on
 * success. Throws CloudAuthError on 401 for the caller to handle.
 */
async function uploadObject(
  key: string,
  file: File,
  note: ((msg: string) => void) | undefined,
  target: UploadTarget,
): Promise<boolean> {
  const { base, token } = cfg();
  const auth = { Authorization: `Bearer ${token}` };
  if (file.size <= DIRECT_UPLOAD_LIMIT) {
    const res = await fetch(`${base}${target.uploadPrefix}${keyForSegment(key)}`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/octet-stream" },
      body: file,
    });
    if (res.status === 401) throw new CloudAuthError();
    return res.ok;
  }
  const init = await fetch(`${base}${target.mpPrefix}/init`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ key, contentType: file.type || "application/octet-stream" }),
  });
  if (init.status === 401) throw new CloudAuthError();
  if (!init.ok) return false;
  const { uploadId } = (await init.json()) as { uploadId: string };

  const partSize = DIRECT_UPLOAD_LIMIT;
  const partCount = Math.ceil(file.size / partSize);
  const parts: { partNumber: number; etag: string }[] = [];
  for (let p = 1; p <= partCount; p++) {
    note?.(`part ${p}/${partCount}`);
    const part = file.slice((p - 1) * partSize, p * partSize);
    const res = await fetch(
      `${base}${target.mpPrefix}/part?key=${keyForSegment(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${p}`,
      { method: "PUT", headers: { ...auth, "Content-Type": "application/octet-stream" }, body: part },
    );
    if (res.status === 401) throw new CloudAuthError();
    if (!res.ok) {
      await fetch(`${base}${target.mpPrefix}/abort`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ key, uploadId }),
      }).catch(() => {});
      return false;
    }
    parts.push((await res.json()) as { partNumber: number; etag: string });
  }
  const done = await fetch(`${base}${target.mpPrefix}/complete`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ key, uploadId, parts }),
  });
  if (done.status === 401) throw new CloudAuthError();
  return done.ok;
}

/* ---------- selective cloud management ----------
 * Which songs/albums/playlists live in the cloud is the user's call: tracks
 * can be uploaded individually and deleted individually, and deleted items
 * get tombstoned so the next full-library sync doesn't resurrect them. */

const EXCLUDE_KEY = "cloudExcluded";

async function getExcluded(): Promise<Set<string>> {
  const { db } = await import("@/core/library/db");
  const row = await db.meta.get(EXCLUDE_KEY);
  return new Set((row?.value as string[] | undefined) ?? []);
}

async function writeExcluded(set: Set<string>): Promise<void> {
  const { db } = await import("@/core/library/db");
  await db.meta.put({ key: EXCLUDE_KEY, value: [...set] });
}

export async function removeCloudExcluded(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const set = await getExcluded();
  const before = set.size;
  for (const p of paths) set.delete(p);
  if (set.size !== before) await writeExcluded(set);
}

async function addCloudExcluded(paths: string[]): Promise<void> {
  const set = await getExcluded();
  const before = set.size;
  for (const p of paths) set.add(p);
  if (set.size !== before) await writeExcluded(set);
}

/** Ship files + covers to R2, then ADD them to the manifest under the
 *  write lock (never touching entries the user uploaded from elsewhere).
 *  scope "catalogue" publishes into the shared catalogue instead (admin). */
export async function uploadTracks(
  tracks: TrackMeta[],
  resolveFile: (track: TrackMeta) => Promise<File | null>,
  onProgress?: (p: SyncProgress) => void,
  resolveCover?: (coverKey: string) => Promise<Blob | null>,
  scope: "user" | "catalogue" = "user",
): Promise<{ uploaded: number; failed: number; manifestWritten: boolean }> {
  const target = uploadTarget(scope);
  if (scope === "user") await removeCloudExcluded(tracks.map((t) => t.path)); // manual upload = un-tombstone
  const manifestTracks: CloudManifestTrack[] = [];
  let uploaded = 0;
  let failed = 0;
  const coversDone = new Set<string>();

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const key = objectKeyFor(track);
    onProgress?.({ done: i, total: tracks.length, current: track.fileName });
    try {
      const file = await resolveFile(track);
      if (!file) {
        failed++;
        continue;
      }
      const ok = await uploadObject(
        key,
        file,
        (msg) => onProgress?.({ done: i, total: tracks.length, current: `${track.fileName} · ${msg}` }),
        target,
      );
      if (!ok) {
        failed++;
        continue;
      }
      if (track.coverKey && !coversDone.has(track.coverKey) && resolveCover) {
        const blob = await resolveCover(track.coverKey);
        if (blob) {
          const cres = await fetch(`${cfg().base}${target.uploadPrefix}cover/${keyForSegment(track.coverKey)}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${cfg().token}`, "Content-Type": blob.type || "image/png" },
            body: blob,
          });
          if (cres.status === 401) throw new CloudAuthError();
          if (cres.ok) coversDone.add(track.coverKey);
        }
      }
      uploaded++;
      manifestTracks.push({
        key: `${target.keyPrefix}${key}`,
        // catalogue covers live in the catalogue namespace, so their manifest
        // key is absolute; user covers keep the relative cover/<key> form
        coverKey: track.coverKey ? `${target.keyPrefix}cover/${track.coverKey}` : null,
        lyrics: track.lyrics ?? null,
        title: track.title,
        artist: track.artist,
        artists: track.artists,
        album: track.album,
        albumArtist: track.albumArtist,
        trackNo: track.trackNo,
        discNo: track.discNo,
        year: track.year,
        genre: track.genre,
        duration: track.duration,
        format: track.format,
        bitrate: track.bitrate,
        sampleRate: track.sampleRate,
        bitDepth: track.bitDepth,
        lossless: track.lossless,
        size: file.size,
      });
    } catch (e) {
      if (e instanceof CloudAuthError) throw e;
      failed++;
    }
  }

  let manifestWritten = true;
  await withManifestLock(async () => {
    let server: CloudManifest;
    try {
      server = await target.fetchManifest();
    } catch (e) {
      if (e instanceof CloudAuthError) throw e;
      // unreadable manifest: PUTting the local set would erase the entries
      // this device can't see — leave the listing alone instead
      manifestWritten = false;
      return;
    }
    const seen = new Set(server.tracks.map((t) => t.key));
    const add = manifestTracks.filter((t) => !seen.has(t.key));
    if (add.length === 0) return;
    await target.putManifest({ version: 1, updatedAt: Date.now(), tracks: [...server.tracks, ...add] });
  });
  return { uploaded, failed, manifestWritten };
}

/**
 * Remove tracks from the cloud: bulk-delete the R2 objects, drop them from
 * the manifest under the write lock, tombstone any local counterparts (so a
 * later full sync doesn't re-upload them), and clean up local shadow rows.
 */
export async function deleteCloudTracks(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const { base, token } = cfg();
  const res = await fetch(`${base}/api/library/delete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ keys }),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) return 0;
  const { deleted } = (await res.json()) as { deleted: number };

  await withManifestLock(async () => {
    try {
      const m = await fetchManifest();
      const kill = new Set(keys);
      const remaining = m.tracks.filter((t) => !kill.has(t.key));
      if (remaining.length !== m.tracks.length) {
        await putManifest({ version: 1, updatedAt: Date.now(), tracks: remaining });
      }
    } catch (e) {
      if (e instanceof CloudAuthError) throw e;
      // unreadable manifest: the objects are gone regardless
    }
  });

  // tombstone local counterparts + drop shadow rows
  const { db } = await import("@/core/library/db");
  const keySet = new Set(keys);
  const all = await db.tracks.toArray();
  const shadowPaths: string[] = [];
  const localPaths: string[] = [];
  for (const row of all) {
    if (!keySet.has(row.path)) continue;
    shadowPaths.push(row.path);
    if (row.source !== "cloud") localPaths.push(row.path);
  }
  await db.tracks.bulkDelete(all.filter((r) => keySet.has(r.path)).map((r) => r.id));
  await addCloudExcluded(localPaths);
  return deleted;
}

export async function syncLibraryUp(
  tracks: TrackMeta[],
  resolveFile: (track: TrackMeta) => Promise<File | null>,
  onProgress?: (p: SyncProgress) => void,
  resolveCover?: (coverKey: string) => Promise<Blob | null>,
  scope: "user" | "catalogue" = "user",
): Promise<{ uploaded: number; skipped: number; failed: number; dedupeOk: boolean; manifestWritten: boolean }> {
  const target = uploadTarget(scope);
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const coversDone = new Set<string>();

  // tombstoned items stay out of personal syncs; the catalogue has no tombstones
  const excluded = scope === "user" ? await getExcluded() : null;
  const list = excluded ? tracks.filter((t) => !excluded.has(t.path)) : tracks;

  // what the server already has: unchanged files don't get re-uploaded.
  // A failed read must reach the caller: proceeding silently would re-send
  // everything and report it as "new", hiding a dead link to the server.
  let serverBySize = new Map<string, number>();
  const serverCovers = new Set<string>();
  let dedupeOk = true;
  try {
    const server = await target.fetchManifest();
    for (const t of server.tracks) {
      serverBySize.set(t.key, t.size);
      if (t.coverKey) serverCovers.add(t.coverKey);
    }
  } catch (e) {
    if (e instanceof CloudAuthError) throw e;
    dedupeOk = false; // unreachable manifest: assume empty and upload everything
  }

  const manifestTracks: CloudManifestTrack[] = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const key = objectKeyFor(t);
    onProgress?.({ done: i, total: list.length, current: t.fileName });
    try {
      const file = await resolveFile(t);
      if (!file) {
        failed++;
        continue;
      }
      // same key + same size = already in the bucket: manifest union keeps it
      const storeKey = `${target.keyPrefix}${key}`;
      if (serverBySize.get(storeKey) === file.size) {
        skipped++;
        continue;
      }
      const ok = await uploadObject(
        key,
        file,
        (msg) => onProgress?.({ done: i, total: list.length, current: `${t.fileName} · ${msg}` }),
        target,
      );
      if (!ok) {
        failed++;
        continue;
      }
      // ship the album cover once per album (only when the server lacks it)
      const coverStoreKey = t.coverKey ? `${target.keyPrefix}cover/${t.coverKey}` : null;
      if (t.coverKey && !coversDone.has(t.coverKey) && (coverStoreKey === null || !serverCovers.has(coverStoreKey)) && resolveCover) {
        const blob = await resolveCover(t.coverKey);
        if (blob) {
          const cres = await fetch(`${cfg().base}${target.uploadPrefix}cover/${keyForSegment(t.coverKey)}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${cfg().token}`, "Content-Type": blob.type || "image/png" },
            body: blob,
          });
          if (cres.ok) coversDone.add(t.coverKey);
        }
      }
      uploaded++;
      manifestTracks.push({
        key: storeKey,
        coverKey: t.coverKey && coversDone.has(t.coverKey) ? coverStoreKey : null,
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

  onProgress?.({ done: list.length, total: list.length, current: "Writing manifest…" });
  // Serialize against concurrent writers and union with what the server
  // already has (local wins on duplicate keys): a sync landing mid-ADD must
  // not wipe tracks that only exist in the cloud. When the union read fails
  // there is nothing safe to write — PUTting the local set would erase every
  // entry this device can't see (fatal for the shared catalogue) — so the
  // listing is left alone and the next successful sync unions these in.
  let manifestWritten = true;
  await withManifestLock(async () => {
    const local = manifestTracks;
    let merged = local;
    try {
      const server = await target.fetchManifest();
      const seen = new Set(local.map((t) => t.key));
      merged = [...local, ...server.tracks.filter((t) => !seen.has(t.key))];
    } catch (e) {
      if (e instanceof CloudAuthError) throw e;
      manifestWritten = false;
      return;
    }
    await target.putManifest({ version: 1, updatedAt: Date.now(), tracks: merged });
  });
  return { uploaded, skipped, failed, dedupeOk, manifestWritten };
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
    // a freshly downloaded catalogue song now qualifies for the merged
    // library view (downloaded or liked): rescan the cached set
    if (key.startsWith("catalogue/")) {
      void import("./catalogueStore").then((m) => m.useCatalogueCached.getState().refresh());
    }
    return true;
  } catch (e) {
    if (e instanceof CloudAuthError) throw e;
    return false;
  }
}

/**
 * Live object URLs handed out for cached audio: each is a full audio blob in
 * memory, so keep only a small window of them around and revoke the rest.
 * The currently-playing URL is always among the most recent.
 */
const liveCachedUrls = new Map<string, string>(); // cache key → object URL
const LIVE_URL_CAP = 6;

function trackLiveUrl(key: string, url: string): string {
  liveCachedUrls.set(key, url);
  while (liveCachedUrls.size > LIVE_URL_CAP) {
    const oldest = liveCachedUrls.keys().next().value;
    if (oldest === undefined) break;
    const stale = liveCachedUrls.get(oldest);
    liveCachedUrls.delete(oldest);
    if (stale) URL.revokeObjectURL(stale);
  }
  return url;
}

export async function cachedTrackUrl(key: string): Promise<string | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheKeyFor(key));
    if (!hit) return null;
    const blob = await hit.blob();
    return trackLiveUrl(key, URL.createObjectURL(blob));
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
