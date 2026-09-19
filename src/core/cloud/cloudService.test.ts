import { beforeEach, describe, expect, it } from "vitest";
import {
  cloudConfigured,
  keyForSegment,
  manifestToTracks,
  normalizeCloudUrl,
  objectKeyFor,
  streamUrlFor,
} from "./cloudService";
import type { CloudManifest } from "./cloudService";
import type { TrackMeta } from "@/core/library/types";
import { useUi } from "@/state/uiStore";

beforeEach(() => {
  useUi.setState({ cloudUrl: "https://cloud.example.com/", cloudToken: "tok-123" });
});

const track = (over: Partial<TrackMeta> = {}): TrackMeta => ({
  id: 1,
  path: "C:\\music\\song.mp3",
  fileName: "song.mp3",
  title: "Song",
  artist: "Artist",
  artists: ["Artist"],
  album: "Album",
  albumArtist: "Artist",
  trackNo: 1,
  discNo: null,
  year: 2024,
  genre: ["Pop"],
  duration: 100,
  format: "mp3",
  bitrate: 320,
  sampleRate: 44100,
  bitDepth: null,
  lossless: false,
  grade: "SR",
  coverKey: null,
  addedAt: 0,
  playCount: 0,
  lastPlayedAt: null,
  ...over,
});

describe("objectKeyFor", () => {
  it("builds artist/album/file keys and strips unsafe characters", () => {
    expect(objectKeyFor(track())).toBe("audio/Artist/Album/song.mp3");
    const messy = track({ fileName: "tr/ack?:*.wav", albumArtist: "A<B>C" });
    expect(objectKeyFor(messy)).toBe("audio/A_B_C/Album/tr_ack_.wav");
  });
});

describe("keyForSegment / streamUrlFor", () => {
  it("URL-encodes each path segment but preserves slashes", () => {
    expect(keyForSegment("audio/Kaito Mirage/01 - A.wav")).toBe("audio/Kaito%20Mirage/01%20-%20A.wav");
    const url = streamUrlFor("audio/a b/c.wav");
    expect(url.startsWith("https://cloud.example.com/api/stream/")).toBe(true);
    expect(url).toContain("token=tok-123");
    expect(url).toContain("audio/a%20b/c.wav");
  });
});

describe("normalizeCloudUrl / cloudConfigured", () => {
  it("rejects non-URLs instead of letting fetch resolve them against the app origin", () => {
    expect(normalizeCloudUrl("not-a-url")).toBeNull();
    expect(normalizeCloudUrl("")).toBeNull();
    expect(normalizeCloudUrl("   ")).toBeNull();
    expect(normalizeCloudUrl("ftp://files.example.com")).toBeNull();
    expect(normalizeCloudUrl("http://")).toBeNull();
  });

  it("accepts absolute http(s) URLs and strips trailing slashes", () => {
    expect(normalizeCloudUrl("https://cloud.example.com")).toBe("https://cloud.example.com");
    expect(normalizeCloudUrl(" https://cloud.example.com/// ")).toBe("https://cloud.example.com");
    expect(normalizeCloudUrl("http://127.0.0.1:8787/")).toBe("http://127.0.0.1:8787");
  });

  it("counts the cloud as configured only with a valid URL and non-empty token", () => {
    useUi.setState({ cloudUrl: "https://cloud.example.com", cloudToken: "tok" });
    expect(cloudConfigured()).toBe(true);
    useUi.setState({ cloudUrl: "not-a-url" });
    expect(cloudConfigured()).toBe(false);
    useUi.setState({ cloudUrl: "https://cloud.example.com", cloudToken: "" });
    expect(cloudConfigured()).toBe(false);
  });
});

describe("manifestToTracks", () => {
  it("maps manifest entries to cloud TrackMeta", () => {
    const manifest: CloudManifest = {
      version: 1,
      updatedAt: 42,
      tracks: [
        {
          key: "audio/A/B/c.flac",
          coverKey: "cv_x",
          lyrics: "[00:01.00] hello",
          title: "C",
          artist: "A",
          artists: ["A"],
          album: "B",
          albumArtist: "A",
          trackNo: 3,
          discNo: 1,
          year: 2020,
          genre: ["Rock"],
          duration: 12.5,
          format: "flac",
          bitrate: null,
          sampleRate: 48000,
          bitDepth: 24,
          lossless: true,
          size: 1,
        },
      ],
    };
    const tracks = manifestToTracks(manifest);
    expect(tracks).toHaveLength(1);
    const t = tracks[0];
    expect(t.source).toBe("cloud");
    expect(t.grade).toBe("SSR");
    expect(t.coverKey).toBe("cv_x");
    expect(t.lyrics).toBe("[00:01.00] hello");
    expect(t.playable).toBe(true);
    expect(t.id).toBeGreaterThan(0);
    expect(t.path).toBe("audio/A/B/c.flac");
    expect(t.addedAt).toBe(42);
  });
});
