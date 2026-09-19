import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from "./types";
import { importEntries, type ImportProgress, type ImportResult } from "./importService";
import { db } from "./db";

/**
 * Tauri-shell ingestion — replaces the browser FS-Access path when running
 * inside the desktop shell (WKWebView on macOS has no showDirectoryPicker,
 * and Chromium-only handles don't persist there). Uses the Tauri dialog +
 * fs plugins: pick a folder once, recursive-walk it, and feed the same
 * importEntries pipeline the browser paths use.
 */

export function inTauriShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const ROOTS_KEY = "tauriRootDirs";

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  flac: "audio/flac",
  wav: "audio/wav",
  wave: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/mp4",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  alac: "audio/mp4",
  webm: "video/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
};

interface FsNode {
  name: string;
  path: string;
}

/** Recursive walk (symlinks skipped — no loops). Builds absolute child paths. */
async function walkDir(dirPath: string, out: FsNode[]): Promise<void> {
  let entries;
  try {
    entries = await readDir(dirPath);
  } catch {
    return; // unreadable subtree — skip it
  }
  for (const e of entries) {
    if (e.isSymlink) continue;
    const child = `${dirPath}/${e.name}`;
    if (e.isDirectory) await walkDir(child, out);
    else out.push({ name: e.name, path: child });
  }
}

async function collectFolder(
  rootPath: string,
  onProgress?: (p: ImportProgress) => void,
): Promise<{ entries: { path: string; file: File }[]; lrcMap: Map<string, string> } | null> {
  onProgress?.({ done: 0, total: 0, current: "Scanning folder…" });
  const files: FsNode[] = [];
  await walkDir(rootPath, files);

  const media: FsNode[] = [];
  const lrcs: FsNode[] = [];
  for (const f of files) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (AUDIO_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext)) media.push(f);
    else if (ext === "lrc") lrcs.push(f);
  }

  const entries: { path: string; file: File }[] = [];
  for (let i = 0; i < media.length; i++) {
    const f = media[i];
    onProgress?.({ done: i, total: media.length, current: f.name });
    const rel = f.path.slice(rootPath.length).replace(/^[/\\]/, "");
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    const data = await readFile(f.path);
    entries.push({
      path: rel,
      file: new File([data], f.name, { type: MIME[ext] ?? "application/octet-stream" }),
    });
  }

  const lrcMap = new Map<string, string>();
  for (const f of lrcs) {
    try {
      const text = await readTextFile(f.path);
      const base = f.name.replace(/\.[^.]+$/, "").toLowerCase();
      lrcMap.set(base, text);
    } catch {
      // sidecar is optional
    }
  }
  return { entries, lrcMap };
}

async function saveRootPath(path: string): Promise<void> {
  const row = await db.meta.get(ROOTS_KEY);
  const list = (row?.value as string[] | undefined) ?? [];
  if (!list.includes(path)) list.push(path);
  await db.meta.put({ key: ROOTS_KEY, value: list });
}

/** Pick a folder via the native dialog and import it. Returns null when cancelled. */
export async function tauriImportFolder(
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult | null> {
  const picked = await open({ directory: true, multiple: false, title: "Import a music folder" });
  if (typeof picked !== "string") return null;
  const collected = await collectFolder(picked, onProgress);
  if (!collected) return null;
  const result = await importEntries(collected.entries, onProgress, collected.lrcMap);
  await saveRootPath(picked);
  return result;
}

/** Re-walk every previously imported root (paths persist in the shell). */
export async function tauriRescan(
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult | null> {
  const row = await db.meta.get(ROOTS_KEY);
  const roots = (row?.value as string[] | undefined) ?? [];
  if (roots.length === 0) return null;
  const entries: { path: string; file: File }[] = [];
  const lrcMap = new Map<string, string>();
  for (const root of roots) {
    onProgress?.({ done: 0, total: 0, current: `Scanning ${root}…` });
    const collected = await collectFolder(root, onProgress);
    if (!collected) continue;
    entries.push(...collected.entries);
    for (const [k, v] of collected.lrcMap) lrcMap.set(k, v);
  }
  return importEntries(entries, onProgress, lrcMap);
}

export async function tauriRootCount(): Promise<number> {
  const row = await db.meta.get(ROOTS_KEY);
  return ((row?.value as string[] | undefined) ?? []).length;
}
