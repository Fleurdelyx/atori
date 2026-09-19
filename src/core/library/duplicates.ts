import type { TrackMeta } from "./types";

export interface DuplicateGroup {
  /** the copy that survives (earliest added, tie: lowest id) */
  keeper: TrackMeta;
  /** the rest, in the same order they were found */
  duplicates: TrackMeta[];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Group tracks that look like the same song: normalized title + first artist,
 * clustered by duration within a ±2s tolerance (different rips rarely agree
 * to the second). The earliest-added copy becomes the keeper.
 */
export function findDuplicates(tracks: TrackMeta[]): DuplicateGroup[] {
  const bySong = new Map<string, TrackMeta[]>();
  for (const t of tracks) {
    const artist = (t.artists[0] ?? t.artist ?? "").toLowerCase().trim();
    const key = `${norm(t.title)}::${artist}`;
    const list = bySong.get(key);
    if (list) list.push(t);
    else bySong.set(key, [t]);
  }

  const out: DuplicateGroup[] = [];
  for (const list of bySong.values()) {
    if (list.length < 2) continue;
    const ordered = [...list].sort((a, b) => a.addedAt - b.addedAt || a.id - b.id);
    const clusters: TrackMeta[][] = [];
    for (const t of ordered) {
      const cluster = clusters.find(
        (c) => Math.abs((c[0]?.duration ?? 0) - t.duration) <= 2,
      );
      if (cluster) cluster.push(t);
      else clusters.push([t]);
    }
    for (const c of clusters) {
      if (c.length >= 2) out.push({ keeper: c[0], duplicates: c.slice(1) });
    }
  }
  return out.sort((a, b) => b.duplicates.length - a.duplicates.length);
}
