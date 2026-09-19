import { useEffect, useMemo, useState } from "react";
import { liveQuery, type Table } from "dexie";
import { db } from "./db";
import { splitGenres, type Grade, type TrackMeta } from "./types";
import { computeWrapped } from "./wrapped";

export { splitGenres };

export interface AlbumInfo {
  key: string;
  name: string;
  artist: string;
  year: number | null;
  coverKey: string | null;
  grade: Grade;
  tracks: TrackMeta[];
  addedAt: number;
}
export function useDexie<T>(fn: () => T | Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const sub = liveQuery(fn).subscribe({
      next: (v) => alive && setValue(v as T),
      error: (e) => console.warn("dexie liveQuery error", e),
    });
    return () => {
      alive = false;
      sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function useAllTracks(): TrackMeta[] {
  return useDexie(() => db.tracks.toArray(), [db]) ?? [];
}

export interface ArtistInfo {
  name: string;
  albumKeys: string[];
  trackCount: number;
}

const GRADE_ORDER = ["SSR", "SR", "R", "N"];

export function groupAlbums(tracks: TrackMeta[]): AlbumInfo[] {
  const map = new Map<string, AlbumInfo>();
  for (const t of tracks) {
    const key = `${t.album}::${t.albumArtist}`;
    let a = map.get(key);
    if (!a) {
      a = {
        key,
        name: t.album,
        artist: t.albumArtist,
        year: t.year,
        coverKey: null,
        grade: "N",
        tracks: [],
        addedAt: t.addedAt,
      };
      map.set(key, a);
    }
    a.tracks.push(t);
    a.coverKey ??= t.coverKey;
    a.year ??= t.year;
    if (t.addedAt > a.addedAt) a.addedAt = t.addedAt;
    if (GRADE_ORDER.indexOf(t.grade) < GRADE_ORDER.indexOf(a.grade)) a.grade = t.grade;
  }
  for (const a of map.values()) {
    a.tracks.sort((x, y) => (x.discNo ?? 0) - (y.discNo ?? 0) || (x.trackNo ?? 0) - (y.trackNo ?? 0));
  }
  return [...map.values()].sort((a, b) => b.addedAt - a.addedAt);
}

export function groupArtists(tracks: TrackMeta[]): ArtistInfo[] {
  const map = new Map<string, ArtistInfo>();
  for (const t of tracks) {
    const names = t.artists.length ? t.artists : [t.artist];
    for (const name of names) {
      let a = map.get(name);
      if (!a) {
        a = { name, albumKeys: [], trackCount: 0 };
        map.set(name, a);
      }
      a.trackCount++;
      const key = `${t.album}::${t.albumArtist}`;
      if (!a.albumKeys.includes(key)) a.albumKeys.push(key);
    }
  }
  return [...map.values()].sort((a, b) => b.trackCount - a.trackCount);
}

export function useAlbums(): AlbumInfo[] {
  const tracks = useAllTracks();
  return useMemo(() => groupAlbums(tracks), [tracks]);
}

export function useArtists(): ArtistInfo[] {
  const tracks = useAllTracks();
  return useMemo(() => groupArtists(tracks), [tracks]);
}

export interface TagStat {
  /** lowercase normalized label — the stable identity used for filtering */
  key: string;
  /** first-seen casing, for display */
  label: string;
  /** how many tracks carry this tag */
  count: number;
}

/** Tag vocabulary with per-tag track counts, most popular first (ties: alphabetical). */
export function collectTagStats(tracks: TrackMeta[]): TagStat[] {
  const map = new Map<string, TagStat>();
  for (const t of tracks) {
    for (const g of splitGenres(t.genre)) {
      const key = g.toLowerCase();
      const stat = map.get(key);
      if (stat) stat.count++;
      else map.set(key, { key, label: g, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function trackHasTag(t: TrackMeta, key: string): boolean {
  return splitGenres(t.genre).some((g) => g.toLowerCase() === key);
}

export function useTagStats(): TagStat[] {
  const tracks = useAllTracks();
  return useMemo(() => collectTagStats(tracks), [tracks]);
}

/** Year-in-review numbers over the whole play log. */
export function useWrapped() {
  const tracks = useAllTracks();
  const [plays, setPlays] = useState<{ trackId: number; at: number }[]>([]);
  useEffect(() => {
    const sub = liveQuery(() => db.plays.toArray()).subscribe({
      next: (v) => setPlays(v),
      error: (e) => console.warn("plays liveQuery", e),
    });
    return () => sub.unsubscribe();
  }, []);
  return useMemo(() => computeWrapped(plays, tracks), [plays, tracks]);
}

export interface RecentPlay {
  track: TrackMeta;
  at: number;
}

/** Newest play events joined to their tracks; consecutive repeats collapse. */
export function useRecentlyPlayed(limit = 12): RecentPlay[] {
  const tracks = useAllTracks();
  const [plays, setPlays] = useState<{ trackId: number; at: number }[]>([]);
  useEffect(() => {
    const sub = liveQuery(() => db.plays.orderBy("at").reverse().limit(limit * 2).toArray()).subscribe({
      next: (v) => setPlays(v),
      error: (e) => console.warn("plays liveQuery", e),
    });
    return () => sub.unsubscribe();
  }, [limit]);

  return useMemo(() => {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const out: RecentPlay[] = [];
    let lastId = -1;
    for (const p of plays) {
      const t = byId.get(p.trackId);
      if (!t || t.id === lastId) continue;
      lastId = t.id;
      out.push({ track: t, at: p.at });
      if (out.length >= limit) break;
    }
    return out;
  }, [plays, tracks, limit]);
}

export { db };
export type { Table };
