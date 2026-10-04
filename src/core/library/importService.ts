import { db, type TrackSource } from "./db";
import { storeCover } from "./coverCache";
import { captureVideoPoster } from "./videoPoster";
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, coverKeyFor, gradeFor, isPlayableFormat, isVideoFormat, type TrackMeta } from "./types";
import { engine } from "@/core/audio/AudioEngine";
import { coverUrl } from "./coverCache";
import type { ParseRequest, ParseResponse } from "./metadata.worker";

/* ---------- FS Access helpers (cast-local, no global type conflicts) ---------- */

interface DirHandleLike {
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface PermLike {
  queryPermission?(d: { mode: string }): Promise<PermissionState>;
  requestPermission?(d: { mode: string }): Promise<PermissionState>;
}

interface FileEntryLike {
  isFile: boolean;
  name: string;
  getFile(cb: (file: File) => void, err?: (e: unknown) => void): void;
}

interface DirEntryLike {
  isDirectory: boolean;
  name: string;
  createReader(): {
    readEntries(cb: (entries: unknown[]) => void, err?: (e: unknown) => void): void;
  };
}

export function supportsDirectoryPicker(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker;
  if (!picker) return null;
  try {
    return await picker();
  } catch {
    return null; // user cancelled
  }
}

/* ---------- metadata worker (single instance, queued) ---------- */

class MetadataParser {
  private worker: Worker | null = null;
  private pending = new Map<number, { resolve: (r: ParseResponse) => void; reject: (e: unknown) => void }>();
  private nextId = 1;

  private ensure(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./metadata.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (ev: MessageEvent<ParseResponse>) => {
        const p = this.pending.get(ev.data.id);
        if (p) {
          this.pending.delete(ev.data.id);
          p.resolve(ev.data);
        }
      };
      this.worker.onerror = (e) => {
        console.warn("metadata worker error", e);
        // fail every in-flight parse and rebuild the worker on next use:
        // otherwise the import queue hangs forever on a dead worker
        const stuck = this.pending;
        this.pending = new Map();
        this.worker = null;
        for (const p of stuck.values()) p.reject(new Error("metadata worker crashed"));
      };
    }
    return this.worker;
  }

  parse(file: File): Promise<ParseResponse> {
    const w = this.ensure();
    const id = this.nextId++;
    return new Promise<ParseResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const req: ParseRequest = { id, file };
      w.postMessage(req);
    });
  }
}

const parser = new MetadataParser();

/* ---------- import ---------- */

export interface ImportProgress {
  done: number;
  total: number;
  current: string;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  failed: number;
}

interface FileEntry {
  path: string;
  file: File;
  handle?: FileSystemFileHandle;
}

async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: FileEntry[],
  lrcMap: Map<string, string>,
) {
  for await (const entry of (dir as unknown as DirHandleLike).values()) {
    const path = `${prefix}/${entry.name}`;
    if (entry.kind === "directory") {
      await walkDirectory(entry as FileSystemDirectoryHandle, path, out, lrcMap);
    } else if (AUDIO_EXTENSIONS.has(entry.name.split(".").pop()?.toLowerCase() ?? "") || VIDEO_EXTENSIONS.has(entry.name.split(".").pop()?.toLowerCase() ?? "")) {
      const file = await (entry as FileSystemFileHandle).getFile();
      out.push({ path, file, handle: entry as FileSystemFileHandle });
    } else if (entry.name.toLowerCase().endsWith(".lrc")) {
      const text = await (await (entry as FileSystemFileHandle).getFile()).text();
      lrcMap.set(basenameKey(entry.name), text);
    }
  }
}

/** lyrics sidecar lookup key: filename without extension, lowercased */
function basenameKey(name: string): string {
  return name.replace(/\.[^.]+$/, "").toLowerCase();
}

export async function importFromDirectory(
  dir: FileSystemDirectoryHandle,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const entries: FileEntry[] = [];
  const lrcMap = new Map<string, string>();
  onProgress?.({ done: 0, total: 0, current: "Scanning folder…" });
  await walkDirectory(dir, dir.name, entries, lrcMap);
  // persist the root handle so a single permission grant restores the tree
  const { saveRootDir } = await import("./fsPermissions");
  await saveRootDir(dir);
  return importEntries(entries, onProgress, lrcMap);
}

/**
 * Re-walk every saved library root and upsert what's new/changed. Skipped
 * gracefully when no roots are saved or a permission was dropped: the
 * ReconnectBanner flow handles re-granting.
 */
export async function rescanLibrary(
  onProgress?: (p: ImportProgress) => void,
): Promise<{ result: ImportResult | null; roots: number; needsPermission: boolean }> {
  const { getRootDirs } = await import("./fsPermissions");
  const roots = await getRootDirs();
  if (roots.length === 0) return { result: null, roots: 0, needsPermission: false };

  const entries: FileEntry[] = [];
  const lrcMap = new Map<string, string>();
  for (const root of roots) {
    const h = root as unknown as { queryPermission?: (d: { mode: string }) => Promise<PermissionState> };
    let state: PermissionState = "granted";
    try {
      state = (await h.queryPermission?.({ mode: "read" })) ?? "granted";
    } catch {
      state = "denied";
    }
    if (state !== "granted") return { result: null, roots: roots.length, needsPermission: true };
  }
  onProgress?.({ done: 0, total: 0, current: "Scanning library folders…" });
  for (const root of roots) {
    await walkDirectory(root, root.name, entries, lrcMap);
  }
  const result = await importEntries(entries, onProgress);
  return { result, roots: roots.length, needsPermission: false };
}

/** DataTransfer import: walks dropped directories via entries, else files. */
export async function importFromDataTransfer(
  dt: DataTransfer,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  // DataTransfer is neutered once the event handler returns: capture the
  // plain file list up front as a fallback for engines whose drop entries
  // are incomplete (they vary wildly between browsers/versions)
  const capturedFiles = Array.from(dt.files);
  const roots: (FileEntryLike | DirEntryLike)[] = [];
  for (const item of Array.from(dt.items)) {
    const getter = (item as DataTransferItem & { webkitGetAsEntry?: () => FileEntryLike | DirEntryLike | null })
      .webkitGetAsEntry;
    const entry = getter?.call(item) ?? null;
    if (entry) roots.push(entry);
  }
  if (roots.length === 0) return importFromFileList(capturedFiles, onProgress);
  const out: FileEntry[] = [];
  try {
    for (const root of roots) await walkEntry(root, root.name, out);
  } catch (e) {
    console.warn("entry walk failed: falling back to the dropped file list", e);
  }
  if (out.length === 0 && capturedFiles.length > 0) return importFromFileList(capturedFiles, onProgress);
  return importEntries(out, onProgress);
}

/** Read a dropped entry's File. Modern Chromium hands out entries whose
 *  getFile()/readEntries() are promise-based, older ones callback-based;
 *  accept both (arity 0 = promise, else callbacks). */
async function fileFromEntry(entry: FileEntryLike): Promise<File> {
  const g = (entry as unknown as { getFile?: (cb?: (f: File) => void, err?: (e: unknown) => void) => unknown })
    .getFile;
  if (typeof g !== "function") throw new Error("dropped entry exposes no getFile");
  if (g.length === 0) return (g as () => Promise<File>).call(entry);
  return new Promise<File>((res, rej) =>
    (g as (cb: (f: File) => void, err?: (e: unknown) => void) => void).call(entry, res, rej),
  );
}

async function readEntryBatch(
  reader: unknown,
): Promise<(FileEntryLike | DirEntryLike)[]> {
  const r = (reader as { readEntries: unknown }).readEntries as unknown as {
    length: number;
    call: (self: unknown, ...args: unknown[]) => unknown;
  };
  if (r.length === 0) return r.call(reader) as Promise<(FileEntryLike | DirEntryLike)[]>;
  return new Promise((res, rej) =>
    r.call(
      reader,
      (e: unknown[]) => res(e as (FileEntryLike | DirEntryLike)[]),
      rej,
    ),
  );
}

async function walkEntry(entry: FileEntryLike | DirEntryLike, prefix: string, out: FileEntry[]) {
  if ("isFile" in entry) {
    const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
    if (!AUDIO_EXTENSIONS.has(ext) && !VIDEO_EXTENSIONS.has(ext)) return;
    const file = await fileFromEntry(entry);
    out.push({ path: prefix, file });
  } else {
    const reader = entry.createReader();
    for (;;) {
      const batch = await readEntryBatch(reader);
      if (batch.length === 0) break;
      for (const e of batch) await walkEntry(e, `${prefix}/${e.name}`, out);
    }
  }
}

export async function importFromFileList(
  files: File[],
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const entries: FileEntry[] = [];
  for (const f of files) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!AUDIO_EXTENSIONS.has(ext) && !VIDEO_EXTENSIONS.has(ext)) continue;
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
    entries.push({ path: rel || f.name, file: f });
  }
  return importEntries(entries, onProgress);
}

/** External metadata laid over whatever tags a downloaded file carries. */
export interface RemoteOverrides {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number | null;
  format?: string;
}

function safeSegment(s: string): string {
  return (
    s
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "untitled"
  );
}

/**
 * Import a single downloaded file (e.g. from the yt-dlp companion), applying
 * external metadata over the container's tags. Path is derived from
 * artist/title so re-downloading the same song updates in place.
 */
export async function importWithOverrides(
  file: File,
  overrides: RemoteOverrides,
): Promise<ImportResult> {
  const ext = (overrides.format ?? file.name.split(".").pop() ?? "m4a").toLowerCase();
  const path = `downloads/${safeSegment(overrides.artist ?? "unknown")}/${safeSegment(overrides.title ?? file.name)}.${ext}`;
  return importEntries([{ path, file }], undefined, undefined, overrides);
}

/** Deterministic integer id from path: makes track put() a natural upsert. */
function hashPath(path: string): number {
  let h = 5381;
  for (let i = 0; i < path.length; i++) h = ((h << 5) + h + path.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * 32-bit hashes collide (~1% odds around 10k tracks) and a colliding put()
 * silently replaces an unrelated track. Walk deterministic salts until the id
 * slot is free or already belongs to this same path: upsert semantics stay
 * stable across rescans because the walk is reproducible.
 */
async function resolveTrackId(path: string): Promise<number> {
  let id = hashPath(path);
  for (let n = 0; n < 64; n++) {
    const row = await db.tracks.get(id);
    if (!row || row.path === path) return id;
    id = hashPath(`${path}#${n}`);
  }
  // astronomically unlikely: give up on determinism rather than clobber
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

/** Cover key for a video file's captured poster frame (track-unique: tagless
 *  downloads all share the "Unknown Album" identity, and each poster is its
 *  own artwork, unlike an album's shared cover). */
export function posterKey(path: string): string {
  return `cvp_${hashPath(path).toString(36)}`;
}

/**
 * Remove tracks from the library: the track and source rows go, the attached
 * visual goes, and covers are garbage-collected (track-unique posters always;
 * album covers only when the last track referencing them is gone). Files on
 * disk are never touched: re-import restores everything. Returns the number
 * of tracks removed.
 */
export async function deleteFromLibrary(paths: string[]): Promise<number> {
  const dropped: TrackMeta[] = [];
  await db.transaction("rw", db.tracks, db.sources, db.visuals, db.covers, async () => {
    for (const path of paths) {
      const track = await db.tracks.where("path").equals(path).first();
      await db.tracks.where("path").equals(path).delete();
      await db.sources.delete(path);
      if (!track) continue;
      dropped.push(track);
      await db.visuals.delete(track.id);
    }
    const keys = [...new Set(dropped.map((t) => t.coverKey).filter((k): k is string => !!k))];
    for (const key of keys) {
      const poster = key.startsWith("cvp_");
      const stillUsed = poster
        ? false
        : (await db.tracks.filter((t) => t.coverKey === key).count()) > 0;
      if (poster || !stillUsed) await db.covers.delete(key);
    }
  });
  return dropped.length;
}

export async function importEntries(
  entries: FileEntry[],
  onProgress?: (p: ImportProgress) => void,
  lrcMap?: Map<string, string>,
  overrides?: RemoteOverrides,
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, failed: 0 };
  const total = entries.length;

  for (let i = 0; i < total; i++) {
    const { path, file, handle } = entries[i];
    onProgress?.({ done: i, total, current: file.name });

    const existingSource = await db.sources.get(path);
    if (existingSource && existingSource.file?.size === file.size && !handle) {
      result.skipped++;
      continue;
    }

    try {
      const res = await parser.parse(file);
      if (!res.ok || !res.meta) {
        result.failed++;
        continue;
      }
      const m = res.meta;
      let remoteArt = false;
      if (overrides) {
        const artist = overrides.artist?.trim() || m.artist;
        m.title = overrides.title?.trim() || m.title;
        m.artist = artist;
        if (overrides.artist?.trim()) m.artists = [overrides.artist.trim()];
        m.album = overrides.album?.trim() || m.album || artist;
        m.albumArtist = artist;
        if (overrides.duration != null && overrides.duration > 0) m.duration = overrides.duration;
        if (overrides.format) m.format = overrides.format;
        // cover comes from the fetched thumbnail, not embedded art
        remoteArt = true;
      }
      const key = coverKeyFor(m.album, m.albumArtist);
      if (m.picture) void storeCover(key, m.picture);

      // video files usually ship without embedded art: a grabbed frame
      // stands in as the cover (stored per-track, not per-album)
      let poster: Blob | null = null;
      if (!m.picture && !remoteArt && isVideoFormat(m.format)) {
        poster = await captureVideoPoster(file).catch(() => null);
        if (poster) void storeCover(posterKey(path), poster);
      }

      const existing = await db.tracks.where("path").equals(path).first();
      const meta: TrackMeta = {
        id: hashPath(path),
        path,
        fileName: file.name,
        title: m.title,
        artist: m.artist,
        artists: m.artists,
        album: m.album,
        albumArtist: m.albumArtist,
        trackNo: m.trackNo,
        discNo: m.discNo,
        year: m.year,
        genre: m.genre,
        duration: m.duration,
        format: m.format,
        bitrate: m.bitrate,
        sampleRate: m.sampleRate,
        bitDepth: m.bitDepth,
        lossless: m.lossless,
        grade: gradeFor(m.format, m.bitrate, m.lossless),
        coverKey: m.picture || remoteArt ? key : poster ? posterKey(path) : (existing?.coverKey ?? null),
        lyrics: m.lyrics ?? lrcMap?.get(basenameKey(file.name)) ?? undefined,
        hasVideo: isVideoFormat(m.format),
        source: "local",
        playable: isPlayableFormat(m.format),
        addedAt: existing?.addedAt ?? Date.now(),
        playCount: existing?.playCount ?? 0,
        lastPlayedAt: existing?.lastPlayedAt ?? null,
      };

      const source: TrackSource = { path };
      if (handle) source.handle = handle;
      else source.file = file;

      await db.transaction("rw", db.tracks, db.sources, async () => {
        meta.id = await resolveTrackId(path);
        await db.tracks.put(meta);
        await db.sources.put(source);
      });
      existing ? result.updated++ : result.added++;
    } catch (e) {
      console.warn("import failed for", path, e);
      result.failed++;
    }
  }
  onProgress?.({ done: total, total, current: "Done" });
  return result;
}

/* ---------- engine wiring ---------- */

let wired = false;

export function wireEngine() {
  if (wired) return;
  wired = true;

  engine.trackResolver = async (path) => {
    const src = await db.sources.get(path);
    if (!src) return null;
    if (src.handle) {
      const h = src.handle as unknown as PermLike & FileSystemFileHandle;
      try {
        let state = (await h.queryPermission?.({ mode: "read" })) ?? "granted";
        if (state !== "granted") state = (await h.requestPermission?.({ mode: "read" })) ?? "denied";
        if (state === "granted") return await src.handle.getFile();
      } catch {
        /* fall through to stored file */
      }
      if (src.file) return src.file;
      return null;
    }
    return src.file ?? null;
  };

  engine.coverResolver = (key) => coverUrl(key);
}
