import { describe, expect, it } from "vitest";
import { pickSimilar } from "./autoplay";
import type { TrackMeta } from "@/core/library/types";

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
    duration: 100,
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

describe("pickSimilar", () => {
  const seed = track(1, { genre: ["Rock", "Pop"], artist: "A", albumArtist: "A", album: "AL" });

  it("prefers shared tags over same artist, and excludes queued/seed", () => {
    const pool = [
      seed,
      track(2, { genre: ["Rock", "Live"], artist: "R", albumArtist: "R", album: "R-AL" }), // 1 shared tag = 2
      track(3, { genre: ["Rock", "Pop"], artist: "R", albumArtist: "R", album: "R-AL" }), // 2 shared tags = 4
      track(4, { artist: "A", albumArtist: "A", album: "OTHER", genre: ["Jazz"] }), // artist only = 1
      track(5, { artist: "Z", albumArtist: "Z", album: "Z-AL", genre: ["Jazz"] }), // 0 — out
      track(6, { genre: ["Rock"], artist: "R", albumArtist: "R", album: "R-AL" }), // excluded as queued
    ];
    const picks = pickSimilar(seed, pool, new Set([6]), 10);
    // distinct scores → deterministic order: 4, 2, 1
    expect(picks.map((t) => t.id)).toEqual([3, 2, 4]);
  });

  it("returns nothing when nothing is related", () => {
    expect(
      pickSimilar(seed, [track(9, { artist: "Z", albumArtist: "Z", album: "Z-AL", genre: ["Techno"] })], new Set(), 5),
    ).toEqual([]);
  });

  it("respects the limit", () => {
    const pool = Array.from({ length: 20 }, (_, i) => track(100 + i, { genre: ["Rock"] }));
    expect(pickSimilar(seed, pool, new Set(), 5)).toHaveLength(5);
  });
});
