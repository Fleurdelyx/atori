import { splitGenres, type TrackMeta } from "@/core/library/types";

/**
 * Autoplay picker — "keep the music going" when the queue runs dry.
 * Tracks sharing genre tags with the seed score highest (each shared tag
 * counts), then same artist/album; within a score band the order is
 * shuffled so repeats feel fresh. Pure + unit-tested.
 */
export function pickSimilar(
  seed: TrackMeta,
  all: TrackMeta[],
  excludeIds: Set<number>,
  n: number,
): TrackMeta[] {
  const seedTags = new Set(splitGenres(seed.genre).map((g) => g.toLowerCase()));
  const scored = all
    .filter((t) => t.id !== seed.id && !excludeIds.has(t.id) && t.playable !== false)
    .map((t) => {
      let score = 0;
      for (const g of splitGenres(t.genre)) {
        if (seedTags.has(g.toLowerCase())) score += 2;
      }
      if (t.artist === seed.artist || t.albumArtist === seed.albumArtist) score += 1;
      if (t.album === seed.album) score += 1;
      return { t, score };
    })
    .filter((x) => x.score > 0);

  // shuffle first so equal-scored tracks come out in a fresh order
  for (let i = scored.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [scored[i], scored[j]] = [scored[j], scored[i]];
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, n)).map((x) => x.t);
}
