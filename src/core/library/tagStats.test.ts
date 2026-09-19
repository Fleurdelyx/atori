import { describe, expect, it } from "vitest";
import { collectTagStats, splitGenres, trackHasTag } from "./useLibrary";
import type { TrackMeta } from "./types";

function track(partial: Partial<TrackMeta> = {}): TrackMeta {
  return {
    id: 0,
    path: "",
    fileName: "",
    title: "",
    artist: "",
    artists: [],
    album: "",
    albumArtist: "",
    trackNo: null,
    discNo: null,
    year: null,
    genre: [],
    duration: 0,
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

describe("splitGenres", () => {
  it("splits multi-value separator strings that ID3 packs into one element", () => {
    expect(splitGenres(["Rock; Pop"])).toEqual(["Rock", "Pop"]);
    expect(splitGenres(["J-Pop/Anime", "Soundtrack, OST"])).toEqual(["J-Pop", "Anime", "Soundtrack", "OST"]);
  });

  it("trims whitespace and drops empties", () => {
    expect(splitGenres(["  Rock , , Pop  "])).toEqual(["Rock", "Pop"]);
    expect(splitGenres(["", "   "])).toEqual([]);
  });

  it("dedupes case-insensitively, keeping the first-seen casing", () => {
    expect(splitGenres(["Rock", "ROCK", "rock", "Pop"])).toEqual(["Rock", "Pop"]);
  });
});

describe("collectTagStats", () => {
  it("counts tracks per tag and sorts by count desc, then key asc", () => {
    const stats = collectTagStats([
      track({ genre: ["Rock"] }),
      track({ genre: ["Rock; Pop"] }),
      track({ genre: ["pop"] }),
      track({ genre: ["Anime"] }),
    ]);
    expect(stats).toEqual([
      { key: "pop", label: "Pop", count: 2 },
      { key: "rock", label: "Rock", count: 2 },
      { key: "anime", label: "Anime", count: 1 },
    ]);
  });

  it("tolerates untagged tracks", () => {
    expect(collectTagStats([track(), track({ genre: [] })])).toEqual([]);
  });
});

describe("trackHasTag", () => {
  it("matches by normalized key across split multi-values", () => {
    const t = track({ genre: ["Rock; Pop"] });
    expect(trackHasTag(t, "rock")).toBe(true);
    expect(trackHasTag(t, "pop")).toBe(true);
    expect(trackHasTag(t, "jazz")).toBe(false);
  });
});
