import { splitGenres, type TrackMeta } from "./types";

export interface TrackMatch {
  hit: boolean;
  /** the query only matched inside the lyrics text */
  byLyrics: boolean;
}

/**
 * Filter matcher for tracks: title/artist/album first, tags next, lyrics as
 * the fallback so a remembered lyric line or genre finds the song.
 */
export function matchTrack(t: TrackMeta, q: string): TrackMatch {
  if (!q) return { hit: true, byLyrics: false };
  const needle = q.toLowerCase();
  if (
    t.title.toLowerCase().includes(needle) ||
    t.artist.toLowerCase().includes(needle) ||
    t.album.toLowerCase().includes(needle)
  ) {
    return { hit: true, byLyrics: false };
  }
  if (splitGenres(t.genre).some((g) => g.toLowerCase().includes(needle))) {
    return { hit: true, byLyrics: false };
  }
  const byLyrics = (t.lyrics ?? "").toLowerCase().includes(needle);
  return { hit: byLyrics, byLyrics };
}
