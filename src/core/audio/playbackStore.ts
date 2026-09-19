import { create } from "zustand";
import { engine, type RepeatMode } from "./AudioEngine";
import type { TrackMeta } from "@/core/library/types";

const VOLUME_KEY = "atori:volume";
const LAST_KEY = "atori:lastTrack";
const SHUFFLE_KEY = "atori:shuffle";
const REPEAT_KEY = "atori:repeat";
const QUEUE_KEY = "atori:queueV2";

let preMuteVolume = 0.9;
/** most recent playback position — used by the debounced queue saver */
let lastKnownPos = 0;
let queueSaveTimer: number | null = null;

/** Persist the last played track + position (best-effort; private mode etc. just skips). */
export function saveLastTrack(track: TrackMeta | null, pos: number) {
  if (!track) return;
  const savedAt = Date.now();
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ track, pos, savedAt }));
  } catch {
    // storage unavailable — restore simply won't happen
  }
  cloudResumePush?.({ track, pos, savedAt });
}

/** Save the full queue so a reload brings the session back, context included. */
export function saveQueueNow(queue: TrackMeta[], index: number, pos: number) {
  if (queue.length === 0) return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify({ queue, index, pos, savedAt: Date.now() }));
  } catch {
    // storage unavailable
  }
}

function scheduleQueueSave(queue: TrackMeta[], index: number) {
  if (queueSaveTimer != null) window.clearTimeout(queueSaveTimer);
  queueSaveTimer = window.setTimeout(() => {
    queueSaveTimer = null;
    saveQueueNow(queue, index, lastKnownPos);
  }, 500);
}

export function readQueueState(): { queue: TrackMeta[]; index: number; pos: number; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { queue?: TrackMeta[]; index?: number; pos?: number; savedAt?: number };
    if (!Array.isArray(parsed.queue) || parsed.queue.length === 0) return null;
    return {
      queue: parsed.queue,
      index: typeof parsed.index === "number" ? parsed.index : 0,
      pos: typeof parsed.pos === "number" ? parsed.pos : 0,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 1,
    };
  } catch {
    return null;
  }
}

/**
 * Registered by main.tsx when the cloud layer is ready — pushes the same
 * snapshot to the signed-in account so any device can continue listening.
 */
type CloudResumePush = (state: { track: TrackMeta; pos: number; savedAt: number }) => void;
let cloudResumePush: CloudResumePush | null = null;
export function setCloudResumePush(fn: CloudResumePush | null) {
  cloudResumePush = fn;
}

interface PlaybackState {
  queue: TrackMeta[];
  index: number;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  repeat: RepeatMode;
  shuffle: boolean;
  current: TrackMeta | null;
  /** bumped whenever the current track changes — FX cut-ins subscribe to this */
  trackChangeTick: number;
  playQueue: (tracks: TrackMeta[], startIndex: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (t: number) => void;
  setVolume: (v: number) => void;
  muteToggle: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  jumpTo: (queueIndex: number) => void;
  insertNext: (track: TrackMeta) => void;
  addToQueue: (track: TrackMeta) => void;
  moveInQueue: (from: number, to: number) => void;
  removeFromQueue: (queueIndex: number) => void;
  upNext: () => TrackMeta[];
}

export const usePlayback = create<PlaybackState>()((set) => ({
  queue: [],
  index: -1,
  isPlaying: false,
  position: 0,
  duration: 0,
  volume: 0.9,
  repeat: "off",
  shuffle: false,
  current: null,
  trackChangeTick: 0,

  playQueue: (tracks, startIndex) => {
    void engine.playQueue(tracks, startIndex);
  },
  toggle: () => void engine.toggle(),
  next: () => void engine.next(),
  prev: () => void engine.prev(),
  seek: (t) => engine.seek(t),
  setVolume: (v) => {
    engine.setVolume(v);
    set({ volume: v });
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      // storage unavailable
    }
  },
  cycleRepeat: () => {
    const order: RepeatMode[] = ["off", "all", "one"];
    const next = order[(order.indexOf(engine.repeat) + 1) % order.length];
    engine.setRepeat(next);
    set({ repeat: next });
    try {
      localStorage.setItem(REPEAT_KEY, next);
    } catch {
      // storage unavailable
    }
  },
  toggleShuffle: () => {
    const on = !engine.shuffle;
    engine.setShuffle(on);
    set({ shuffle: on });
    try {
      localStorage.setItem(SHUFFLE_KEY, on ? "1" : "0");
    } catch {
      // storage unavailable
    }
  },
  muteToggle: () => {
    const s = usePlayback.getState();
    if (s.volume === 0) s.setVolume(preMuteVolume || 0.9);
    else {
      preMuteVolume = s.volume;
      s.setVolume(0);
    }
  },
  jumpTo: (queueIndex) => void engine.jumpTo(queueIndex),
  insertNext: (track) => engine.insertNext(track),
  addToQueue: (track) => engine.addToQueue(track),
  moveInQueue: (from, to) => engine.moveInQueue(from, to),
  removeFromQueue: (queueIndex) => engine.removeFromQueue(queueIndex),
  upNext: () => engine.upNext(),
}));

// Wire the engine as source of truth → store mirror.
let lastTrackKey: string | null = null;
engine.onPatch = (patch) => {
  const state = usePlayback.getState();
  const queue = patch.queue ?? state.queue;
  const index = patch.index ?? state.index;
  const current = queue[index] ?? null;
  const key = current ? `${current.id}:${current.path}` : null;
  const trackChanged = key !== lastTrackKey;
  lastTrackKey = key;
  if (typeof patch.position === "number") lastKnownPos = patch.position;
  if (patch.queue) scheduleQueueSave(queue, index);
  // persist track/position, but never on the boot-restore patch (that would
  // clobber the saved resume position with 0 before anything plays)
  const playing = state.isPlaying || patch.isPlaying === true;
  if (current && trackChanged && playing) saveLastTrack(current, 0);
  else if (current && patch.isPlaying === false && state.isPlaying) saveLastTrack(current, state.position);
  usePlayback.setState({
    ...patch,
    current,
    trackChangeTick: trackChanged && current ? state.trackChangeTick + 1 : state.trackChangeTick,
  });
};
