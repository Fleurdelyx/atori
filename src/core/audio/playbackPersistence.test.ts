import { describe, expect, it, beforeEach } from "vitest";
import type { TrackMeta } from "@/core/library/types";
import { engine } from "./AudioEngine";
import { usePlayback, saveLastTrack } from "./playbackStore";

function meta(overrides: Partial<TrackMeta> = {}): TrackMeta {
  return {
    id: 7,
    path: "u/1/signal-bloom.flac",
    fileName: "signal-bloom.flac",
    title: "Signal Bloom",
    artist: "Aurora Units",
    artists: ["Aurora Units"],
    album: "Dream Circuit",
    albumArtist: "Aurora Units",
    trackNo: 1,
    discNo: null,
    year: 2026,
    genre: [],
    duration: 25,
    format: "flac",
    bitrate: 900,
    sampleRate: 44100,
    bitDepth: 16,
    lossless: true,
    grade: "SSR",
    coverKey: null,
    addedAt: 0,
    playCount: 0,
    lastPlayedAt: null,
    ...overrides,
  };
}

const TRACK = meta();

// the singleton engine carries state across tests — keep its media side effects inert
(engine as unknown as Record<string, unknown>).bumpPlayCount = () => {};

// jsdom 30's URL.createObjectURL crashes on its own Blob internals — the engine
// only needs a string src, so pin the blob-URL pair to inert mocks
URL.createObjectURL = () => "blob:mock-url";
URL.revokeObjectURL = () => {};

describe("volume persistence", () => {
  beforeEach(() => localStorage.clear());

  it("setVolume mirrors the value into localStorage", () => {
    usePlayback.getState().setVolume(0.37);
    expect(localStorage.getItem("atori:volume")).toBe("0.37");
    expect(usePlayback.getState().volume).toBeCloseTo(0.37);
  });
});

describe("last-track persistence", () => {
  beforeEach(() => localStorage.clear());

  it("saveLastTrack skips a null track", () => {
    saveLastTrack(null, 3);
    expect(localStorage.getItem("atori:lastTrack")).toBeNull();
  });

  it("saveLastTrack stores the track and position", () => {
    saveLastTrack(TRACK, 12.5);
    const saved = JSON.parse(localStorage.getItem("atori:lastTrack")!);
    expect(saved.track.id).toBe(7);
    expect(saved.track.title).toBe("Signal Bloom");
    expect(saved.pos).toBe(12.5);
  });

  it("bridge saves on a track change while playing, and on pause", async () => {
    const t2 = meta({ id: 8, title: "Parallel Hearts", path: "u/1/parallel-hearts.flac" });
    engine.trackResolver = async () => new File([new Uint8Array([1])], "a.flac");
    await engine.playQueue([TRACK], 0);
    engine.el.dispatchEvent(new Event("play")); // isPlaying → true
    localStorage.clear();
    await engine.playQueue([t2], 0); // track change while playing → save (t2, 0)
    const afterSwitch = JSON.parse(localStorage.getItem("atori:lastTrack")!);
    expect(afterSwitch.track.id).toBe(8);
    expect(afterSwitch.pos).toBe(0);
    engine.el.dispatchEvent(new Event("pause")); // pause → save (current, position)
    const afterPause = JSON.parse(localStorage.getItem("atori:lastTrack")!);
    expect(afterPause.track.id).toBe(8);
    expect(afterPause.pos).toBeCloseTo(engine.el.currentTime, 1);
  });

  it("bridge never saves on the boot-restore patch", () => {
    saveLastTrack(TRACK, 17);
    engine.restoreTrack(TRACK, 17); // looks like a track change, but nothing is playing
    const saved = JSON.parse(localStorage.getItem("atori:lastTrack")!);
    expect(saved.track.id).toBe(7);
    expect(saved.pos).toBe(17); // resume position must not be clobbered to 0
  });
});

describe("restoreTrack", () => {
  beforeEach(() => {
    localStorage.clear();
    engine.queue = [];
    engine.index = -1;
  });

  it("seeds the queue without resolving any audio", () => {
    let resolved = 0;
    engine.trackResolver = async () => { resolved++; return new File([new Uint8Array([1])], "a.flac"); };
    engine.restoreTrack(TRACK, 10);
    expect(engine.queue).toHaveLength(1);
    expect(engine.index).toBe(0);
    expect(resolved).toBe(0); // no audio loading at restore time
    expect(usePlayback.getState().current?.id).toBe(7);
    expect(usePlayback.getState().isPlaying).toBe(false);
    expect(usePlayback.getState().duration).toBe(25);
    expect(usePlayback.getState().position).toBe(10); // UI shows the resume point before load
  });

  it("defers audio loading to the first play()", async () => {
    let resolved = 0;
    engine.trackResolver = async () => { resolved++; return new File([new Uint8Array([1])], "a.flac"); };
    engine.restoreTrack(TRACK, 10);
    await engine.play();
    expect(resolved).toBe(1); // loaded exactly once, on play
    expect(engine.el.src).toContain("blob:");
  });
});

describe("fades (jsdom: no AudioContext → el.volume fallback ramp)", () => {
  beforeEach(() => {
    localStorage.clear();
    engine.setVolume(0.9);
    engine.setFade(true);
    engine.setCrossfade(false);
  });

  it("fade-in ramps volume from 0 up to the user volume on play", async () => {
    engine.trackResolver = async () => new File([new Uint8Array([1])], "a.flac");
    engine.restoreTrack(TRACK, 0);
    await engine.play();
    expect(engine.el.volume).toBeLessThan(0.5); // ramp started at 0
    await new Promise((r) => setTimeout(r, 900));
    expect(engine.el.volume).toBeCloseTo(0.9, 1); // settled at user volume
  }, 10000);

  it("pause fades down then restores the volume", async () => {
    engine.trackResolver = async () => new File([new Uint8Array([1])], "a.flac");
    await engine.playQueue([TRACK], 0);
    await new Promise((r) => setTimeout(r, 900)); // let the fade-in settle
    await engine.pause();
    expect(engine.el.paused).toBe(true);
    expect(engine.el.volume).toBeCloseTo(0.9, 1);
  }, 10000);

  it("disabling fades pauses immediately", async () => {
    engine.setFade(false);
    engine.trackResolver = async () => new File([new Uint8Array([1])], "a.flac");
    await engine.playQueue([TRACK], 0);
    await engine.pause();
    expect(engine.el.paused).toBe(true);
    expect(engine.el.volume).toBeCloseTo(0.9, 1);
  }, 10000);
});

describe("mute + playback pref persistence", () => {
  beforeEach(() => localStorage.clear());

  it("muteToggle silences and restores the pre-mute volume", () => {
    usePlayback.getState().setVolume(0.6);
    usePlayback.getState().muteToggle();
    expect(usePlayback.getState().volume).toBe(0);
    expect(localStorage.getItem("atori:volume")).toBe("0");
    usePlayback.getState().muteToggle();
    expect(usePlayback.getState().volume).toBeCloseTo(0.6);
    expect(localStorage.getItem("atori:volume")).toBe("0.6");
  });

  it("cycleRepeat persists the repeat mode", () => {
    usePlayback.getState().cycleRepeat(); // off → all
    expect(localStorage.getItem("atori:repeat")).toBe("all");
    usePlayback.getState().cycleRepeat(); // all → one
    expect(localStorage.getItem("atori:repeat")).toBe("one");
  });

  it("toggleShuffle persists the shuffle flag", () => {
    usePlayback.getState().toggleShuffle();
    expect(localStorage.getItem("atori:shuffle")).toBe("1");
    expect(engine.shuffle).toBe(true);
    usePlayback.getState().toggleShuffle();
    expect(localStorage.getItem("atori:shuffle")).toBe("0");
    expect(engine.shuffle).toBe(false);
  });
});
