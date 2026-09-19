import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { db, type Playlist } from "./db";

export async function createPlaylist(name: string): Promise<number> {
  const id = await db.playlists.add({ name: name.trim() || "New Playlist", trackIds: [], createdAt: Date.now() });
  return id as number;
}

export function renamePlaylist(id: number, name: string) {
  return db.playlists.update(id, { name: name.trim() || "New Playlist" });
}

export function deletePlaylist(id: number) {
  return db.playlists.delete(id);
}

export function addToPlaylist(id: number, trackIds: number[]) {
  return db.transaction("rw", db.playlists, async () => {
    const pl = await db.playlists.get(id);
    if (!pl) return;
    const merged = [...pl.trackIds];
    for (const tid of trackIds) if (!merged.includes(tid)) merged.push(tid);
    await db.playlists.update(id, { trackIds: merged });
  });
}

export function removeFromPlaylist(id: number, trackId: number) {
  return db.transaction("rw", db.playlists, async () => {
    const pl = await db.playlists.get(id);
    if (!pl) return;
    await db.playlists.update(id, { trackIds: pl.trackIds.filter((t) => t !== trackId) });
  });
}

export function setPlaylistTracks(id: number, trackIds: number[]) {
  return db.playlists.update(id, { trackIds });
}

/** Reactive playlists feed, newest first. */
export function usePlaylists(): Playlist[] {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  useEffect(() => {
    const sub = subscribePlaylists((v) => setPlaylists([...v].sort((a, b) => b.createdAt - a.createdAt)));
    return () => sub.unsubscribe();
  }, []);
  return playlists;
}

/* Module-level cache so non-hook callers (context menus) see fresh data. */
let cache: Playlist[] = [];
let subscribed = false;

export function primePlaylistCache() {
  if (subscribed) return;
  subscribed = true;
  subscribePlaylists((v) => {
    cache = v;
  });
}

export function getCachedPlaylists(): Playlist[] {
  return cache;
}

function subscribePlaylists(next: (v: Playlist[]) => void) {
  return liveQuery(() => db.playlists.toArray()).subscribe({
    next,
    error: (e) => console.warn("playlists liveQuery", e),
  });
}
