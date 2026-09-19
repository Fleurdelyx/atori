import { describe, expect, it } from "vitest";
import type { TrackMeta } from "./types";
import { matchTrack } from "./search";

const base: TrackMeta = {
  id: 1,
  path: "u/1/a.flac",
  fileName: "a.flac",
  title: "Signal Bloom",
  artist: "Aurora Units",
  artists: ["Aurora Units"],
  album: "Dream Circuit",
  albumArtist: "Aurora Units",
  trackNo: null,
  discNo: null,
  year: null,
  genre: [],
  duration: 25,
  format: "flac",
  bitrate: null,
  sampleRate: null,
  bitDepth: null,
  lossless: true,
  grade: "SSR",
  coverKey: null,
  addedAt: 0,
  playCount: 0,
  lastPlayedAt: null,
};

const withLyrics: TrackMeta = {
  ...base,
  id: 2,
  title: "Night Drive",
  artist: "Vaporline",
  album: "Neon Skyline",
  lyrics: "[00:12.00]City lights are calling out to me\n[00:18.00]We drive until the dawn",
};

describe("matchTrack", () => {
  it("matches on title, artist and album", () => {
    expect(matchTrack(withLyrics, "night driv").hit).toBe(true);
    expect(matchTrack(withLyrics, "vaporline").hit).toBe(true);
    expect(matchTrack(withLyrics, "skyline").hit).toBe(true);
  });

  it("falls back to lyrics and flags the match", () => {
    const m = matchTrack(withLyrics, "until the dawn");
    expect(m.hit).toBe(true);
    expect(m.byLyrics).toBe(true);
    expect(matchTrack(withLyrics, "city lights").byLyrics).toBe(true);
  });

  it("does not match unrelated queries", () => {
    const m = matchTrack(withLyrics, "hammer");
    expect(m.hit).toBe(false);
    expect(m.byLyrics).toBe(false);
  });

  it("does not flag title matches as lyrics matches", () => {
    expect(matchTrack(withLyrics, "night").byLyrics).toBe(false);
  });

  it("matches split genre tags without flagging them as lyrics", () => {
    const tagged = { ...base, genre: ["Rock; Pop", "Anime"] };
    expect(matchTrack(tagged, "rock").hit).toBe(true);
    expect(matchTrack(tagged, "anime").hit).toBe(true);
    expect(matchTrack(tagged, "pop").byLyrics).toBe(false);
    expect(matchTrack(tagged, "jazz").hit).toBe(false);
  });

  it("treats an empty query as a match", () => {
    expect(matchTrack(withLyrics, "").hit).toBe(true);
    expect(matchTrack(withLyrics, "").byLyrics).toBe(false);
  });
});
