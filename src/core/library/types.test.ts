import { describe, expect, it } from "vitest";
import { coverKeyFor, formatTime, gradeFor, isPlayableFormat } from "./types";

describe("gradeFor", () => {
  it("grades lossless formats as SSR", () => {
    expect(gradeFor("flac", null, true)).toBe("SSR");
    expect(gradeFor("wav", 1000, false)).toBe("SSR");
  });

  it("grades bitrate bands for lossy formats", () => {
    expect(gradeFor("mp3", 320, false)).toBe("SR");
    expect(gradeFor("mp3", 256, false)).toBe("R");
    expect(gradeFor("mp3", 128, false)).toBe("N");
    expect(gradeFor("mp3", null, false)).toBe("N");
  });
});

describe("isPlayableFormat", () => {
  it("accepts chromium-decodable codecs", () => {
    expect(isPlayableFormat("mp3")).toBe(true);
    expect(isPlayableFormat("flac")).toBe(true);
    expect(isPlayableFormat("wav")).toBe(true);
    expect(isPlayableFormat("ogg")).toBe(true);
  });

  it("rejects codecs chromium cannot decode", () => {
    expect(isPlayableFormat("wma")).toBe(false);
    expect(isPlayableFormat("aiff")).toBe(false);
    expect(isPlayableFormat("aif")).toBe(false);
    expect(isPlayableFormat("APE")).toBe(false);
  });
});

describe("coverKeyFor", () => {
  it("is stable and input-sensitive", () => {
    expect(coverKeyFor("Album", "Artist")).toBe(coverKeyFor("Album", "Artist"));
    expect(coverKeyFor("Album", "Artist")).not.toBe(coverKeyFor("Album 2", "Artist"));
  });
});

describe("formatTime", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatTime(59)).toBe("0:59");
    expect(formatTime(61)).toBe("1:01");
    expect(formatTime(3671)).toBe("1:01:11");
  });

  it("handles bad input", () => {
    expect(formatTime(Number.NaN)).toBe("--:--");
    expect(formatTime(-4)).toBe("--:--");
  });
});
