import { useEffect, useMemo, useState } from "react";
import { liveQuery, type Table } from "dexie";
import { db } from "./db";
import { splitGenres, type Grade, type TrackMeta } from "./types";
import { computeWrapped } from "./wrapped";
import { manifestToTracks } from "@/core/cloud/cloudService";
import { useCloud } from "@/core/cloud/cloudStore";
import { useCatalogue } from "@/core/cloud/catalogueStore";

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

/**
 * The whole library: local rows merged with the signed-in cloud manifest:
 * the Spotify-style view where a hosted app streams from the worker instead
 * of importing files. Local wins on path collisions (it plays offline);
 * cloud rows come from the manifest, with play stats overlaid from the local
 * shadow rows the engine writes when a stream is played.
 */
export function useAllTracks(): TrackMeta[] {
  const local = useDexie(() => db.tracks.toArray(), [db]) ?? [];
  const manifest = useCloud((s) => s.manifest);
  const catalogueManifest = useCatalogue((s) => s.manifest);
  return useMemo(() => {
    const cloud = manifest ? manifestToTracks(manifest) : [];
    const catalogue = catalogueManifest ? manifestToTracks(catalogueManifest) : [];
    if (cloud.length === 0 && catalogue.length === 0) {
      // no manifests (signed out / offline / error): shadow rows would be
      // ghosts: they only exist while a manifest still lists their track
      return local.filter((t) => t.source !== "cloud");
    }
    const localByPath = new Map(local.map((t) => [t.path, t]));
    // one entry per SONG, identity = normalized title + artist + album.
    // Dedupe order: local copy wins over its cloud twin, personal cloud wins
    // over the shared catalogue, and among copies the first entry wins (the
    // manifests accumulated same-song-different-key rows from syncs).
    const identity = (t: TrackMeta) =>
      `${t.title.trim().toLowerCase()}::${t.artist.trim().toLowerCase()}::${t.album.trim().toLowerCase()}`;
    const seen = new Set<string>();
    const out: TrackMeta[] = [];
    // catalogue membership follows the SONG, not a specific copy: an admin
    // who published their own library keeps seeing their local copies, badged
    // and grouped under the CATALOGUE scope instead of vanishing into dedupe
    const catalogueIds = new Set(catalogue.map((c) => identity(c)));
    for (const t of local) {
      if (t.source === "cloud") continue; // shadow rows surface via their manifest entry below
      out.push({ ...t, inCatalogue: catalogueIds.has(identity(t)) });
      seen.add(identity(t));
    }
    // the shadow overlay carries local edits (Edit info) + play stats, which
    // win over any manifest copy on this device
    const shadowed = (c: TrackMeta) => {
      const shadow = localByPath.get(c.path);
      return shadow
        ? {
            ...c,
            title: shadow.title ?? c.title,
            artist: shadow.artist ?? c.artist,
            artists: shadow.artists.length ? shadow.artists : c.artists,
            album: shadow.album ?? c.album,
            albumArtist: shadow.albumArtist ?? c.albumArtist,
            year: shadow.year ?? c.year,
            genre: shadow.genre.length ? shadow.genre : c.genre,
            lyrics: shadow.lyrics ?? c.lyrics,
            playCount: shadow.playCount,
            lastPlayedAt: shadow.lastPlayedAt,
            addedAt: shadow.addedAt,
            gainDb: shadow.gainDb,
          }
        : c;
    };
    for (const c of cloud) {
      const id = identity(c);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(shadowed({ ...c, inCatalogue: catalogueIds.has(id) }));
    }
    for (const c of catalogue) {
      const id = identity(c);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(shadowed({ ...c, inCatalogue: true }));
    }
    return out;
  }, [local, manifest, catalogueManifest]);
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
  /** lowercase normalized label: the stable identity used for filtering */
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
    const seen = new Set<number>(); // one row per track: the latest play wins
    for (const p of plays) {
      if (seen.has(p.trackId)) continue;
      const t = byId.get(p.trackId);
      if (!t) continue;
      seen.add(p.trackId);
      out.push({ track: t, at: p.at });
      if (out.length >= limit) break;
    }
    return out;
  }, [plays, tracks, limit]);
}

export { db };
export type { Table };
