import { splitGenres, type TrackMeta } from "./types";

export interface WrappedStats {
  /** total listening time in minutes */
  minutes: number;
  /** number of tracked plays in the log */
  plays: number;
  /** distinct tracks played */
  uniqueTracks: number;
  topTrack: { title: string; artist: string; plays: number } | null;
  topArtists: { name: string; plays: number }[];
  topAlbums: { name: string; plays: number }[];
  topTags: { name: string; plays: number }[];
}

export interface WrappedPlay {
  /** track path (local file path or cloud object key); null = the log row's
   *  track no longer resolves anywhere, so the play is ignored */
  path: string | null;
  at: number;
}

/** Year-in-review numbers derived from the play log. Pure + unit-tested.
 *  Plays are keyed by track path so the local log and the account's synced
 *  log merge into one view regardless of device-specific ids. */
export function computeWrapped(plays: WrappedPlay[], tracks: TrackMeta[]): WrappedStats {
  const byPath = new Map(tracks.map((t) => [t.path, t]));
  const perTrack = new Map<string, number>();
  for (const p of plays) if (p.path) perTrack.set(p.path, (perTrack.get(p.path) ?? 0) + 1);

  let minutes = 0;
  let uniqueTracks = 0;
  let joinedPlays = 0;
  const artists = new Map<string, number>();
  const albums = new Map<string, number>();
  const tags = new Map<string, number>();
  let topTrack: { title: string; artist: string; plays: number } | null = null;

  for (const [path, count] of perTrack) {
    const t = byPath.get(path);
    if (!t) continue;
    joinedPlays += count;
    uniqueTracks++;
    minutes += (t.duration * count) / 60;
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + count);
    bump(artists, t.artist || "Unknown");
    bump(albums, t.album || "Unknown");
    for (const g of splitGenres(t.genre)) bump(tags, g);
    if (!topTrack || count > topTrack.plays) topTrack = { title: t.title, artist: t.artist, plays: count };
  }

  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, n)
      .map(([name, plays]) => ({ name, plays }));

  return {
    minutes: Math.round(minutes),
    plays: joinedPlays,
    uniqueTracks,
    topTrack,
    topArtists: top(artists, 5),
    topAlbums: top(albums, 5),
    topTags: top(tags, 5),
  };
}
