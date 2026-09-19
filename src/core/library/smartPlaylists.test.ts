import { describe, expect, it } from "vitest";
import { matchSmartPlaylist } from "./smartPlaylists";
import type { SmartPlaylist } from "./db";
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
    year: 2020,
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

const rule: SmartPlaylist = { id: 1, name: "R", createdAt: 0 };

describe("matchSmartPlaylist", () => {
  it("filters by tag, year range, and minimum plays together", () => {
    const tracks = [
      track(1, { genre: ["Rock; Pop"], year: 2021, playCount: 5 }),
      track(2, { genre: ["Rock"], year: 2015, playCount: 9 }), // year below range
      track(3, { genre: ["Pop"], year: 2022, playCount: 1 }), // plays below min
      track(4, { genre: ["Jazz"], year: 2021, playCount: 9 }), // no matching tag
      track(5, { genre: [], year: 2021, playCount: 9 }), // no tag at all
    ];
    const r: SmartPlaylist = { ...rule, tag: "rock", minYear: 2018, maxYear: 2025, minPlays: 3 };
    expect(matchSmartPlaylist(r, tracks).map((t) => t.id)).toEqual([1]);
  });

  it("matches multi-value genre strings case-insensitively", () => {
    const r: SmartPlaylist = { ...rule, tag: "J-POP" };
    expect(matchSmartPlaylist(r, [track(1, { genre: ["j-pop; anime"] })]).length).toBe(1);
  });

  it("with no rules set, matches everything", () => {
    expect(matchSmartPlaylist(rule, [track(1), track(2)]).length).toBe(2);
  });

  it("excludes untagged years when a year rule exists", () => {
    const r: SmartPlaylist = { ...rule, minYear: 2000 };
    expect(matchSmartPlaylist(r, [track(1, { year: null }), track(2, { year: 2020 })]).map((t) => t.id)).toEqual([2]);
  });
});
