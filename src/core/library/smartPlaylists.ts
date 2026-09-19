import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { db, type SmartPlaylist } from "./db";
import { splitGenres, type TrackMeta } from "./types";

/** CRUD over rule-based playlists. Matching is derived at read time, so they
 *  stay current with the library automatically — that's the point of them. */

export async function createSmartPlaylist(rule: Omit<SmartPlaylist, "createdAt">): Promise<number> {
  const id = await db.smartPlaylists.add({ ...rule, name: rule.name.trim() || "Smart Playlist", createdAt: Date.now() });
  return id as number;
}

export function updateSmartPlaylist(id: number, rule: Partial<SmartPlaylist>) {
  return db.smartPlaylists.update(id, rule);
}

export function deleteSmartPlaylist(id: number) {
  return db.smartPlaylists.delete(id);
}

/** Tracks matching a rule — tag (any overlap), year range, minimum plays. */
export function matchSmartPlaylist(rule: SmartPlaylist, tracks: TrackMeta[]): TrackMeta[] {
  const minYear = rule.minYear ?? -Infinity;
  const maxYear = rule.maxYear ?? Infinity;
  const minPlays = rule.minPlays ?? 0;
  const wantTag = rule.tag?.toLowerCase().trim();
  return tracks.filter((t) => {
    if (t.year !== null && (t.year < minYear || t.year > maxYear)) return false;
    if (t.year === null && (rule.minYear != null || rule.maxYear != null)) return false;
    if ((t.playCount ?? 0) < minPlays) return false;
    if (wantTag) {
      const tags = splitGenres(t.genre).map((g) => g.toLowerCase());
      if (!tags.includes(wantTag)) return false;
    }
    return true;
  });
}

/** Reactive feed, newest first. */
export function useSmartPlaylists(): SmartPlaylist[] {
  const [rules, setRules] = useState<SmartPlaylist[]>([]);
  useEffect(() => {
    const sub = liveQuery(() => db.smartPlaylists.toArray()).subscribe({
      next: (v) => setRules([...v].sort((a, b) => b.createdAt - a.createdAt)),
      error: (e) => console.warn("smart playlists liveQuery", e),
    });
    return () => sub.unsubscribe();
  }, []);
  return rules;
}
