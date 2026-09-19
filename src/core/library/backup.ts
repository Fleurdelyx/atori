import { db, type Playlist } from "./db";
import type { TrackMeta } from "./types";

/**
 * Catalog backup — every track's metadata + local playlists + saved cloud
 * keys as one JSON file. Audio blobs/handles are NOT included: cloud tracks
 * re-stream from the worker, local tracks re-link when their folder is
 * re-imported (same path ⇒ same hash id ⇒ metadata re-attaches).
 */

export interface AtoriBackup {
  app: "atori";
  version: 1;
  exportedAt: number;
  tracks: TrackMeta[];
  playlists: Playlist[];
  /** saved cloud track keys (favorites) */
  favorites: string[];
}

export async function buildBackup(): Promise<AtoriBackup> {
  const [tracks, playlists] = await Promise.all([db.tracks.toArray(), db.playlists.toArray()]);
  let favorites: string[] = [];
  try {
    const raw = localStorage.getItem("atori-favs");
    if (raw) favorites = (JSON.parse(raw) as { state?: { keys?: string[] } }).state?.keys ?? [];
  } catch {
    // favorites are best-effort
  }
  return {
    app: "atori",
    version: 1,
    exportedAt: Date.now(),
    tracks,
    playlists,
    favorites,
  };
}

export function downloadBackup(backup: AtoriBackup): void {
  const stamp = new Date(backup.exportedAt).toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `atori-backup-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export interface RestoreResult {
  tracks: number;
  playlists: number;
  favorites: number;
}

export async function restoreBackup(file: File): Promise<RestoreResult> {
  const parsed = JSON.parse(await file.text()) as AtoriBackup;
  if (parsed.app !== "atori" || !Array.isArray(parsed.tracks)) {
    throw new Error("Not an ATRI backup file");
  }
  const tracks = parsed.tracks.filter(
    (t) => typeof t?.id === "number" && typeof t?.path === "string",
  );
  const playlists = (parsed.playlists ?? []).filter((p) => typeof p?.name === "string" && Array.isArray(p.trackIds));
  await db.transaction("rw", db.tracks, db.playlists, async () => {
    await db.tracks.bulkPut(tracks);
    if (playlists.length > 0) await db.playlists.bulkPut(playlists);
  });
  if (parsed.favorites?.length) {
    // merge into the zustand-persist mirror (atori-favs) without clobbering
    try {
      const key = "atori-favs";
      const raw = localStorage.getItem(key);
      const stored = raw ? (JSON.parse(raw) as { state?: { keys?: string[] }; version?: number }) : null;
      const existing = stored?.state?.keys ?? [];
      const merged = [...new Set([...existing, ...parsed.favorites])];
      localStorage.setItem(key, JSON.stringify({ state: { keys: merged }, version: stored?.version ?? 0 }));
    } catch {
      // favorites merge is best-effort
    }
  }
  return { tracks: tracks.length, playlists: playlists.length, favorites: parsed.favorites?.length ?? 0 };
}
