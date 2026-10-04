import { describe, expect, it } from "vitest";
import { buildMirroredList, isLocalMirror } from "./localPlaylistMirror";
import type { CloudPlaylist } from "./accountService";
import type { Playlist } from "@/core/library/db";
import type { TrackMeta } from "@/core/library/types";

function track(id: number, path: string, title: string, artist: string, duration: number): TrackMeta {
  return {
    id,
    path,
    fileName: path,
    title,
    artist,
    artists: [artist],
    album: "",
    albumArtist: "",
    trackNo: null,
    discNo: null,
    year: null,
    genre: [],
    coverKey: null,
    duration,
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

function playlist(id: number, name: string, trackIds: number[]): Playlist {
  return { id, name, trackIds, createdAt: 100 };
}

function cloud(id: string, name: string, trackKeys: string[], updatedAt = 100): CloudPlaylist {
  return { id, name, trackKeys, updatedAt };
}

describe("buildMirroredList", () => {
  it("mirrors local playlists with song-identity members, skipping unresolvable ones", () => {
    const localTracks = [
      track(1, "C:/a.mp3", "Song One", "Alpha", 200),
      track(2, "C:/b.mp3", "Song Two", "Beta", 180),
    ];
    const cloudTracks = [
      track(90, "u/1/song-one.mp3", "Song One", "Alpha", 201),
      track(91, "u/1/other.mp3", "Other", "Gamma", 100),
    ];
    const current = [cloud("p_user1", "My Cloud Mix", ["u/1/keep.mp3"])];
    const next = buildMirroredList([playlist(5, "Faves", [1, 2])], localTracks, current, cloudTracks, "abc123");
    expect(next).not.toBeNull();
    const mirror = next!.find((p) => p.id === "lp_abc123-5");
    expect(mirror).toBeDefined();
    expect(mirror!.name).toBe("Faves");
    expect(mirror!.trackKeys).toEqual(["u/1/song-one.mp3"]); // song two has no cloud twin
    expect(next!.find((p) => p.id === "p_user1")).toEqual(current[0]); // user playlists untouched
  });

  it("prunes this install's orphans but never another device's mirrors", () => {
    const current = [cloud("lp_abc123-5", "Faves", []), cloud("lp_zzz999-9", "Other Device", [])];
    const next = buildMirroredList([], [], current, [], "abc123");
    expect(next).toEqual([cloud("lp_zzz999-9", "Other Device", [])]);
  });

  it("returns null when nothing changed (no network push)", () => {
    const localTracks = [track(1, "C:/a.mp3", "Song One", "Alpha", 200)];
    const current = [cloud("lp_abc123-5", "Faves", ["u/1/song-one.mp3"])];
    const cloudTracks = [track(90, "u/1/song-one.mp3", "Song One", "Alpha", 201)];
    const next = buildMirroredList([playlist(5, "Faves", [1])], localTracks, current, cloudTracks, "abc123");
    expect(next).toBeNull();
  });

  it("updates the mirror when the local playlist changes", () => {
    const localTracks = [track(1, "C:/a.mp3", "Song One", "Alpha", 200)];
    const cloudTracks = [track(90, "u/1/song-one.mp3", "Song One", "Alpha", 201)];
    const current = [cloud("lp_abc123-5", "Faves", [])];
    const next = buildMirroredList([playlist(5, "Renamed", [1])], localTracks, current, cloudTracks, "abc123");
    expect(next).toEqual([cloud("lp_abc123-5", "Renamed", ["u/1/song-one.mp3"], 100)]);
  });

  it("detects mirrors by id prefix", () => {
    expect(isLocalMirror({ id: "lp_abc123-5" })).toBe(true);
    expect(isLocalMirror({ id: "p_user1" })).toBe(false);
  });
});
