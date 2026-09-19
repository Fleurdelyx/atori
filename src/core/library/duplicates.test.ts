import { describe, expect, it } from "vitest";
import { findDuplicates } from "./duplicates";
import type { TrackMeta } from "./types";

function track(id: number, title: string, artist: string, duration: number, addedAt = 0): TrackMeta {
  return {
    id,
    path: `p${id}`,
    fileName: "",
    title,
    artist,
    artists: [artist],
    album: "",
    albumArtist: "",
    trackNo: null,
    discNo: null,
    year: null,
    genre: [],
    duration,
    format: "mp3",
    bitrate: null,
    sampleRate: null,
    bitDepth: null,
    lossless: false,
    grade: "N",
    coverKey: null,
    addedAt,
    playCount: 0,
    lastPlayedAt: null,
  };
}

describe("findDuplicates", () => {
  it("groups same title+artist within the duration tolerance, earliest added is keeper", () => {
    const tracks = [
      track(1, "Song A", "Artist", 200, 20),
      track(2, "song  a", "artist", 201.5, 10),
      track(3, "Song A", "Artist", 250, 5), // different song length — separate recording
      track(4, "Song B", "Artist", 180),
    ];
    const groups = findDuplicates(tracks);
    expect(groups).toHaveLength(1);
    expect(groups[0].keeper.id).toBe(2); // addedAt 10 beats 20
    expect(groups[0].duplicates.map((t) => t.id)).toEqual([1]);
  });

  it("ignores same-title songs by different artists", () => {
    const tracks = [track(1, "Intro", "A", 100), track(2, "Intro", "B", 101)];
    expect(findDuplicates(tracks)).toHaveLength(0);
  });

  it("returns groups sorted by duplicate count desc", () => {
    const tracks = [
      track(1, "Trio", "A", 100, 1),
      track(2, "Trio", "A", 101, 2),
      track(3, "Trio", "A", 99, 3),
      track(4, "Pair", "B", 50, 1),
      track(5, "Pair", "B", 51, 2),
    ];
    const groups = findDuplicates(tracks);
    expect(groups).toHaveLength(2);
    expect(groups[0].duplicates).toHaveLength(2);
    expect(groups[1].duplicates).toHaveLength(1);
  });
});
