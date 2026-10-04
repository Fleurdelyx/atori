import { describe, expect, it } from "vitest";
import type { TrackMeta } from "@/core/library/types";
import { resolveLikedTracks } from "./likedTracks";

function track(id: number, path: string): TrackMeta {
  return {
    id,
    path,
    fileName: path,
    title: `t${id}`,
    artist: "a",
    artists: ["a"],
    album: "",
    albumArtist: "",
    trackNo: null,
    discNo: null,
    year: null,
    genre: [],
    coverKey: null,
    duration: 1,
    format: "mp3",
    bitrate: null,
    sampleRate: null,
    bitDepth: null,
    lossless: false,
    grade: "N",
    addedAt: 0,
    playCount: 0,
    lastPlayedAt: null,
  };
}

describe("resolveLikedTracks", () => {
  it("resolves in like-key order across pools", () => {
    const local = [track(1, "C:/m/a.mp3")];
    const cloud = [track(2, "u/1/b.mp3"), track(3, "catalogue/c.mp3")];
    const out = resolveLikedTracks(["u/1/b.mp3", "C:/m/a.mp3", "catalogue/c.mp3"], local, cloud);
    expect(out.map((t) => t.path)).toEqual(["u/1/b.mp3", "C:/m/a.mp3", "catalogue/c.mp3"]);
  });

  it("local wins over a cloud twin of the same path", () => {
    const local = [track(1, "u/1/same.mp3")];
    const cloud = [track(2, "u/1/same.mp3")];
    const out = resolveLikedTracks(["u/1/same.mp3"], local, cloud);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
  });

  it("drops keys that resolve nowhere", () => {
    const out = resolveLikedTracks(["gone.mp3", "u/1/b.mp3"], [track(2, "u/1/b.mp3")]);
    expect(out.map((t) => t.id)).toEqual([2]);
  });
});
