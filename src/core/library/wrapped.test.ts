import { describe, expect, it } from "vitest";
import { computeWrapped } from "./wrapped";
import type { TrackMeta } from "./types";

function track(id: number, partial: Partial<TrackMeta> = {}): TrackMeta {
  return {
    id,
    path: `p${id}`,
    fileName: "",
    title: `T${id}`,
    artist: "A",
    artists: ["A"],
    album: "AL",
    albumArtist: "A",
    trackNo: null,
    discNo: null,
    year: null,
    genre: [],
    duration: 60,
    format: "mp3",
    bitrate: null,
    sampleRate: null,
    bitDepth: null,
    lossless: false,
    grade: "N",
    coverKey: null,
    addedAt: 0,
    playCount: 0,
    lastPlayedAt: null,
    ...partial,
  };
}

describe("computeWrapped", () => {
  it("aggregates minutes, tops, and unique tracks from the play log", () => {
    const tracks = [
      track(1, { title: "Song One", artist: "Alpha", album: "AL1", genre: ["Rock"] }),
      track(2, { title: "Song Two", artist: "Alpha", album: "AL1", genre: ["Rock", "Pop"] }),
      track(3, { title: "Song Three", artist: "Beta", album: "AL2", genre: ["Pop"] }),
    ];
    const plays = [
      { trackId: 1, at: 1 },
      { trackId: 1, at: 2 },
      { trackId: 1, at: 3 },
      { trackId: 2, at: 4 },
      { trackId: 3, at: 5 },
    ];
    const w = computeWrapped(plays, tracks);
    expect(w.plays).toBe(5);
    expect(w.uniqueTracks).toBe(3);
    expect(w.minutes).toBe(5); // five 60s tracks
    expect(w.topTrack).toEqual({ title: "Song One", artist: "Alpha", plays: 3 });
    expect(w.topArtists[0]).toEqual({ name: "Alpha", plays: 4 });
    expect(w.topTags[0]).toEqual({ name: "Rock", plays: 4 });
    expect(w.topAlbums[0].name).toBe("AL1");
  });

  it("handles an empty log", () => {
    const w = computeWrapped([], [track(1)]);
    expect(w.plays).toBe(0);
    expect(w.topTrack).toBeNull();
    expect(w.minutes).toBe(0);
  });
});
