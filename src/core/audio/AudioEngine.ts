import { audioLevels } from "./AudioLevels";
import { pickSimilar } from "./autoplay";
import { toast } from "@/state/toastStore";
import type { TrackMeta } from "@/core/library/types";

export const EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export type RepeatMode = "off" | "all" | "one";

export interface EngineState {
  queue: TrackMeta[];
  index: number;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  repeat: RepeatMode;
  shuffle: boolean;
}

type Patch = Partial<EngineState>;

const FADE_MS = 500;
const DEFAULT_CROSSFADE_MS = 1200;

/**
 * AudioEngine — the transport. Web Audio graph:
 *   <audio A/B> → srcGainA/B → EQ chain (10 biquads) → analyser → masterGain → out
 * Two media elements so crossfade can overlap tracks; `el` always points at the
 * active one and every UI read follows it. Per-element source gains let the two
 * tracks fade independently while sharing EQ + analyser. The graph (and
 * AnalyserNode) is created lazily on first play so we never violate autoplay
 * policy. All UI reads flow through onPatch subscribers.
 */
class AudioEngine {
  /** Raw media element — exposed for rAF-driven UI (seek bars, progress). */
  el: HTMLAudioElement;
  private elA: HTMLAudioElement;
  private elB: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private srcGainA: GainNode | null = null;
  private srcGainB: GainNode | null = null;
  private eqNodes: BiquadFilterNode[] = [];
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private objectUrlA: string | null = null;
  private objectUrlB: string | null = null;
  private nextObjectUrl: string | null = null;
  private shuffleOrder: number[] = [];
  private eqEnabled = false;
  private eqGains: number[] = EQ_FREQS.map(() => 0);
  private skipAttempts = 0;
  /** a restored track is displayed but its audio isn't loaded until the next play */
  private pendingLoad = false;
  private pendingSeek: number | null = null;
  private userVolume = 0.9;
  fadeEnabled = true;
  crossfadeEnabled = false;
  /** crossfade length in ms — 0 disables (set via setCrossfadeSeconds) */
  crossfadeMs = DEFAULT_CROSSFADE_MS;
  /** when the queue runs dry, append similar tracks and keep playing */
  autoplayEnabled = true;
  /** smart volume — learn per-track loudness and level playback */
  smartVolumeEnabled = false;
  /** a loudness measurement is in flight for this track */
  private measuringFor: TrackMeta | null = null;
  /** a crossfade is rolling — suppress further transitions until it settles */
  private transitioning = false;
  private fadeTimer: number | null = null;
  private endFading = false;

  queue: TrackMeta[] = [];
  index = -1;
  repeat: RepeatMode = "off";
  shuffle = false;

  /** Library layer injects file resolution (IndexedDB handle → File). */
  trackResolver: (path: string) => Promise<File | null> = async () => null;
  /** Cloud layer injects remote-source resolution (cache / stream URL). */
  urlResolver: (track: TrackMeta) => Promise<string | null> = async () => null;
  /** Library layer injects cover-art URL lookup for Media Session artwork. */
  coverResolver: (coverKey: string) => string | null = () => null;
  /** Cloud layer hook: a cloud-track stream failed to load (may be auth). */
  onCloudStreamError: (() => void) | null = null;

  onPatch: ((patch: Patch) => void) | null = null;

  constructor() {
    this.elA = AudioEngine.makeElement();
    this.elB = AudioEngine.makeElement();
    this.el = this.elA;
    this.elA.volume = this.userVolume;
    this.elB.volume = this.userVolume;
    this.bindElementEvents(this.elA);
    this.bindElementEvents(this.elB);
  }

  private static makeElement(): HTMLAudioElement {
    const el = new Audio();
    el.preload = "auto";
    // required for cloud streams: keeps the MediaElementSource untainted
    // (server must answer with Access-Control-Allow-Origin — the worker does)
    el.crossOrigin = "anonymous";
    return el;
  }

  /** Only the active element drives engine state — the idle one is fading in/out. */
  private bindElementEvents(el: HTMLAudioElement) {
    const active = () => el === this.el;
    el.addEventListener("timeupdate", () => {
      if (!active()) return;
      this.emit({ position: el.currentTime });
      this.checkAutoTransition();
    });
    el.addEventListener("durationchange", () => {
      if (!active()) return;
      this.emit({ duration: el.duration || 0 });
    });
    el.addEventListener("play", () => {
      if (active()) this.emit({ isPlaying: true });
    });
    el.addEventListener("pause", () => {
      if (active()) this.emit({ isPlaying: false });
    });
    el.addEventListener("ended", () => {
      if (!active() || this.transitioning) return;
      this.next(true);
    });
    el.addEventListener("error", () => {
      if (!active()) return;
      // cloud tracks may fail on auth — let the cloud layer check the session
      if (this.current?.source === "cloud") this.onCloudStreamError?.();
      // bad file → skip forward so the queue doesn't stall
      if (this.index >= 0) this.next(true);
    });
  }

  private emit(patch: Patch) {
    this.onPatch?.(patch);
  }

  get current(): TrackMeta | null {
    return this.queue[this.orderIndexToQueue(this.index)] ?? null;
  }

  /** `index` is a position in play order (identity under shuffle-off). */
  private orderIndexToQueue(i: number): number {
    if (!this.shuffle) return i;
    if (i < 0 || i >= this.shuffleOrder.length) return -1;
    return this.shuffleOrder[i];
  }

  private buildShuffleOrder() {
    this.shuffleOrder = this.queue.map((_, i) => i);
    for (let i = this.shuffleOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * this.shuffleOrder.length);
      [this.shuffleOrder[i], this.shuffleOrder[j]] = [this.shuffleOrder[j], this.shuffleOrder[i]];
    }
    // keep the initially-picked track first when we shuffle from a selection
    const wanted = this.index;
    const at = this.shuffleOrder.indexOf(wanted);
    if (at > 0) {
      this.shuffleOrder.splice(at, 1);
      this.shuffleOrder.unshift(wanted);
    }
  }

  private ensureGraph() {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.eqNodes = EQ_FREQS.map((f, i) => {
        const node = this.ctx!.createBiquadFilter();
        node.type = i === 0 ? "lowshelf" : i === EQ_FREQS.length - 1 ? "highshelf" : "peaking";
        node.frequency.value = f;
        node.Q.value = 1.1;
        node.gain.value = 0;
        return node;
      });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      this.gain = this.ctx.createGain();

      let node: AudioNode = this.eqNodes[0];
      for (let i = 1; i < this.eqNodes.length; i++) {
        node.connect(this.eqNodes[i]);
        node = this.eqNodes[i];
      }
      node.connect(this.analyser);
      this.analyser.connect(this.gain);
      this.gain.connect(this.ctx.destination);

      this.connectElement(this.elA);
      audioLevels.attach(this.analyser);
      this.applyEq();
    } catch (e) {
      console.warn("AudioEngine: graph init failed, falling back to plain playback", e);
      this.ctx = null;
    }
  }

  /** Route a media element into the shared EQ/analyser chain behind its own gain. */
  private connectElement(el: HTMLAudioElement) {
    if (!this.ctx) return;
    const gain = this.ctx.createGain();
    const src = this.ctx.createMediaElementSource(el);
    src.connect(gain);
    gain.connect(this.eqNodes[0]);
    if (el === this.elA) this.srcGainA = gain;
    else this.srcGainB = gain;
  }

  private srcGainFor(el: HTMLAudioElement): GainNode | null {
    if (!this.ctx) return null;
    if (el === this.elA) return this.srcGainA;
    if (el === this.elB) return this.srcGainB;
    return null;
  }

  private inactiveEl(): HTMLAudioElement {
    return this.el === this.elA ? this.elB : this.elA;
  }

  private applyEq() {
    if (!this.ctx) return;
    this.eqNodes.forEach((n, i) => {
      n.gain.value = this.eqEnabled ? (this.eqGains[i] ?? 0) : 0;
    });
  }

  setEq(enabled: boolean, gainsDb: number[]) {
    this.eqEnabled = enabled;
    this.eqGains = gainsDb;
    this.applyEq();
  }

  setFade(on: boolean) {
    this.fadeEnabled = on;
  }

  setCrossfade(on: boolean) {
    this.crossfadeEnabled = on;
  }

  /** Crossfade window in seconds; 0 turns crossfade off. */
  setCrossfadeSeconds(seconds: number) {
    this.crossfadeMs = Math.max(0, Math.min(12, seconds)) * 1000;
    this.crossfadeEnabled = this.crossfadeMs > 0;
  }

  setSmartVolume(on: boolean) {
    this.smartVolumeEnabled = on;
    if (!on) {
      // drop any learned correction on the live source immediately
      const g = this.srcGainFor(this.el);
      if (g && this.ctx && !this.transitioning) {
        const t = this.ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(1, t + 0.4);
      }
    }
  }

  /** Per-track loudness factor (smart volume), 1 when off/unlearned. */
  private gainBase(track: TrackMeta | null): number {
    if (!this.smartVolumeEnabled || !track?.gainDb) return 1;
    return Math.pow(10, track.gainDb / 20);
  }

  private async resolveAndLoad(track: TrackMeta, el: HTMLAudioElement = this.el, preload = false): Promise<boolean> {
    let url: string | null = null;
    let owned = false; // object URLs we create must be revoked later
    const file = await this.trackResolver(track.path);
    if (file) {
      url = URL.createObjectURL(file);
      owned = true;
    } else {
      // cloud tracks: cached blob or worker stream URL (not owned)
      url = await this.urlResolver(track);
    }
    if (!url) return false;
    if (preload) {
      if (owned) {
        if (this.nextObjectUrl) URL.revokeObjectURL(this.nextObjectUrl);
        this.nextObjectUrl = url;
      }
      return true;
    }
    const prev = el === this.elA ? this.objectUrlA : this.objectUrlB;
    if (prev) URL.revokeObjectURL(prev);
    if (el === this.elA) this.objectUrlA = owned ? url : null;
    else this.objectUrlB = owned ? url : null;
    el.src = url;
    return true;
  }

  async playQueue(queue: TrackMeta[], startIndex: number) {
    this.queue = [...queue];
    this.index = startIndex;
    if (this.shuffle) this.buildShuffleOrder();
    await this.playCurrent();
  }

  private async playCurrent(target?: HTMLAudioElement) {
    const track = this.current;
    if (!track) return;
    this.pendingLoad = false;
    this.endFading = false;
    this.ensureGraph();
    if (this.ctx?.state === "suspended") await this.ctx.resume();

    if (track.playable === false) {
      toast(`${track.title}: ${track.format.toUpperCase()} codec not supported by this browser`, "error", "非対応形式");
      this.skipAndContinue();
      return;
    }

    const el = target ?? this.el;
    const ok = await this.resolveAndLoad(track, el);
    if (!ok) {
      console.warn(`AudioEngine: cannot resolve ${track.path}, skipping`);
      toast(`Cannot open ${track.title} — skipped`, "error", "再生できません");
      this.pendingSeek = null;
      this.skipAndContinue();
      return;
    }
    this.skipAttempts = 0;
    if (this.pendingSeek != null) {
      const pos = this.pendingSeek;
      this.pendingSeek = null;
      // src was just set, so metadata is gone — apply the resume position once duration is known
      if (Number.isFinite(el.duration) && el.duration > 0) {
        el.currentTime = Math.min(pos, el.duration);
      } else {
        const onMeta = () => {
          el.removeEventListener("loadedmetadata", onMeta);
          el.currentTime = Math.min(pos, el.duration || pos);
        };
        el.addEventListener("loadedmetadata", onMeta);
      }
    }
    this.emit({ queue: [...this.queue], index: this.index, duration: track.duration || 0 });
    this.updateMediaSession(track);
    try {
      await el.play();
      this.fadeIn(el, track);
      this.bumpPlayCount(track);
    } catch (e) {
      console.warn("AudioEngine: play() rejected", e);
    }
    this.scheduleLoudnessLearn(track);
    // keep the next track warm — on the idle element when crossfading
    const nextTrack = this.queue[this.orderIndexToQueue(this.index + 1)];
    if (nextTrack) {
      if (this.crossfadeEnabled && this.ctx && !this.transitioning) void this.resolveAndLoad(nextTrack, this.inactiveEl());
      else void this.resolveAndLoad(nextTrack, el, true);
    }
  }

  /** Smart volume: one loudness sample a few seconds in, persisted on the track. */
  private scheduleLoudnessLearn(track: TrackMeta) {
    if (!this.smartVolumeEnabled || track.gainDb != null || this.measuringFor) return;
    this.measuringFor = track;
    window.setTimeout(() => {
      void (async () => {
        try {
          if (!this.smartVolumeEnabled || this.current !== track) return;
          const rms = await audioLevels.sampleRms(3000);
          if (rms == null || rms <= 0.0005 || this.current !== track) return;
          const REF_RMS = 0.12; // quiet-ish reference so most corrections are gentle boosts/cuts
          const gainDb = Math.max(-10, Math.min(10, Math.round(20 * Math.log10(REF_RMS / rms) * 10) / 10));
          track.gainDb = Math.abs(gainDb) < 0.3 ? 0 : gainDb;
          void import("@/core/library/db").then(({ db }) => db.tracks.update(track.id, { gainDb: track.gainDb }));
          // apply to the live source with a gentle glide
          const g = this.srcGainFor(this.el);
          if (g && this.ctx && !this.transitioning) {
            const t = this.ctx.currentTime;
            g.gain.cancelScheduledValues(t);
            g.gain.setValueAtTime(g.gain.value, t);
            g.gain.linearRampToValueAtTime(this.gainBase(track), t + 0.8);
          }
        } finally {
          this.measuringFor = null;
        }
      })();
    }, 5000);
  }

  /** Advance past unplayable/unresolvable tracks; stop after a full lap. */
  private skipAndContinue() {
    this.skipAttempts++;
    this.emit({ isPlaying: false });
    if (this.queue.length > 1 && this.skipAttempts < this.queue.length) {
      void this.next(true);
    }
  }

  async jumpTo(queueIndex: number) {
    if (queueIndex < 0 || queueIndex >= this.queue.length) return;
    const playPos = this.shuffle ? this.shuffleOrder.indexOf(queueIndex) : queueIndex;
    if (playPos < 0) return;
    if (this.crossfadeEnabled && this.ctx && !this.el.paused && !this.transitioning) {
      await this.startCrossfade(playPos);
      return;
    }
    this.index = playPos;
    await this.playCurrent();
  }

  /** Tracks coming after the current one, in play order. */
  upNext(): TrackMeta[] {
    if (this.queue.length === 0) return [];
    if (!this.shuffle) return this.queue.slice(this.index + 1);
    return this.shuffleOrder
      .slice(this.index + 1)
      .map((qi) => this.queue[qi])
      .filter(Boolean);
  }

  /** Insert a track to play immediately after the current one. */
  insertNext(track: TrackMeta) {
    if (this.queue.length === 0) {
      void this.playQueue([track], 0);
      return;
    }
    const curPath = this.current?.path;
    const slot = this.queue.findIndex((t) => t.path === curPath) + 1;
    this.queue.splice(slot, 0, track);
    if (this.shuffle) {
      // guarantee "plays next": current, new track, then the rest reshuffled
      const rest = this.queue.map((_, i) => i).filter((i) => i !== this.index && i !== slot);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * rest.length);
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      this.shuffleOrder = [this.index, slot, ...rest];
      this.index = 0;
    }
    this.emit({ queue: [...this.queue], index: this.index });
  }

  /** Append a track to the end of the queue (plays after everything queued). */
  addToQueue(track: TrackMeta) {
    if (this.queue.length === 0) {
      void this.playQueue([track], 0);
      return;
    }
    this.queue.push(track);
    if (this.shuffle) this.shuffleOrder.push(this.queue.length - 1);
    this.emit({ queue: [...this.queue], index: this.index });
  }

  /**
   * Reorder a queued row (indices refer to the array BEFORE the move; `to` is
   * the insertion slot after removal). The playing track cannot be moved.
   */
  moveInQueue(from: number, to: number) {
    const cur = this.current;
    if (!cur || from === to) return;
    if (from < 0 || to < 0 || from >= this.queue.length || to >= this.queue.length) return;
    if (this.queue[from].path === cur.path) return;
    const [moved] = this.queue.splice(from, 1);
    this.queue.splice(Math.max(0, Math.min(to, this.queue.length)), 0, moved);
    this.index = Math.max(0, this.queue.findIndex((t) => t.path === cur.path));
    if (this.shuffle) {
      this.shuffleOrder = this.queue.map((_, i) => i);
      const at = this.shuffleOrder.indexOf(this.index);
      if (at > 0) {
        this.shuffleOrder.splice(at, 1);
        this.shuffleOrder.unshift(this.index);
      }
    }
    this.emit({ queue: [...this.queue], index: this.index });
  }

  /** Remove a queued track (the currently-playing one is protected). */
  removeFromQueue(queueIndex: number) {
    const cur = this.current;
    if (queueIndex < 0 || queueIndex >= this.queue.length || !cur) return;
    if (this.queue[queueIndex].path === cur.path) return;
    this.queue.splice(queueIndex, 1);
    this.index = Math.max(0, this.queue.findIndex((t) => t.path === cur.path));
    if (this.shuffle) {
      this.shuffleOrder = this.queue.map((_, i) => i);
      const at = this.shuffleOrder.indexOf(this.index);
      if (at > 0) {
        this.shuffleOrder.splice(at, 1);
        this.shuffleOrder.unshift(this.index);
      }
    }
    this.emit({ queue: [...this.queue], index: this.index });
  }

  /** Drop everything after the current track. */
  clearUpNext() {
    const cur = this.current;
    if (!cur) return;
    const curIdx = this.queue.findIndex((t) => t.path === cur.path);
    this.queue = this.queue.slice(0, curIdx + 1);
    this.index = curIdx;
    if (this.shuffle) this.shuffleOrder = [curIdx];
    this.emit({ queue: [...this.queue], index: this.index });
  }

  private bumpPlayCount(track: TrackMeta) {
    track.playCount += 1;
    const at = Date.now();
    track.lastPlayedAt = at;
    void import("@/core/library/db").then(({ db }) =>
      db.transaction("rw", db.tracks, db.plays, async () => {
        await db.tracks.update(track.id, { playCount: track.playCount, lastPlayedAt: at });
        const id = await db.plays.add({ trackId: track.id, at });
        // keep the log bounded — prune in batches
        if (typeof id === "number" && id % 500 === 0) {
          const stale = await db.plays.orderBy("id").limit(Math.max(0, id - 5000)).primaryKeys();
          await db.plays.bulkDelete(stale);
        }
      }),
    );
  }

  private updateMediaSession(track: TrackMeta) {
    if (!("mediaSession" in navigator)) return;
    const artwork = track.coverKey ? this.coverResolver(track.coverKey) : null;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: artwork ? [{ src: artwork, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.setActionHandler("play", () => this.play());
    navigator.mediaSession.setActionHandler("pause", () => this.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => this.prev());
    navigator.mediaSession.setActionHandler("nexttrack", () => this.next());
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) this.seek(d.seekTime);
    });
  }

  async play() {
    this.ensureGraph();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
    if (this.pendingLoad) {
      await this.playCurrent();
      return;
    }
    if (this.index < 0 && this.queue.length > 0) {
      this.index = 0;
      await this.playCurrent();
      return;
    }
    await this.el.play();
    this.fadeIn(this.el);
  }

  async pause() {
    if (this.fadeEnabled && !this.el.paused) {
      await this.fadeOutAndPause();
      return;
    }
    this.el.pause();
  }

  async toggle() {
    if (this.el.paused) await this.play();
    else await this.pause();
  }

  seek(t: number) {
    if (Number.isFinite(t)) this.el.currentTime = Math.max(0, Math.min(t, this.el.duration || t));
  }

  getPosition() {
    return this.el.currentTime;
  }

  setVolume(v: number) {
    this.userVolume = Math.max(0, Math.min(1, v));
    this.elA.volume = this.userVolume;
    this.elB.volume = this.userVolume;
    this.emit({ volume: this.userVolume });
  }

  /** Post-analyser monitor level — silence the speakers without killing the FFT. */
  setMonitorGain(v: number) {
    if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, v));
  }

  async next(auto = false) {
    if (this.queue.length === 0) return;
    if (auto && this.repeat === "one") {
      this.el.currentTime = 0;
      await this.el.play();
      return;
    }
    if (
      this.crossfadeEnabled &&
      this.ctx &&
      !this.el.paused &&
      !this.transitioning &&
      this.repeat !== "one"
    ) {
      await this.startCrossfade();
      return;
    }
    const nextIdx = this.index + 1;
    if (nextIdx >= this.queue.length) {
      if (this.repeat === "all") {
        this.index = 0;
        await this.playCurrent();
      } else if (!auto) {
        // manual next past the end wraps anyway — feels better in a player
        this.index = 0;
        await this.playCurrent();
      } else if (this.autoplayEnabled) {
        // Spotify-style autoplay: queue similar tracks and keep going
        const added = await this.extendWithSimilar();
        if (added > 0) {
          this.index = nextIdx;
          await this.playCurrent();
          return;
        }
        this.el.pause();
        this.el.currentTime = 0;
      } else {
        this.el.pause();
        this.el.currentTime = 0;
      }
      return;
    }
    this.index = nextIdx;
    await this.playCurrent();
  }

  async prev() {
    if (this.queue.length === 0) return;
    if (this.el.currentTime > 3) {
      this.el.currentTime = 0;
      return;
    }
    this.index = this.index - 1 < 0 ? this.queue.length - 1 : this.index - 1;
    await this.playCurrent();
  }

  setShuffle(on: boolean) {
    this.shuffle = on;
    if (on) this.buildShuffleOrder();
    else this.shuffleOrder = [];
    // re-index to keep the current track selected
    this.emit({ shuffle: on });
  }

  setRepeat(mode: RepeatMode) {
    this.repeat = mode;
    this.emit({ repeat: mode });
  }

  /** Show a restored track as current without loading audio — the next play() loads it first. */
  restoreTrack(track: TrackMeta, pos = 0) {
    this.restoreQueue([track], 0, pos);
  }

  /** Restore a whole queue (paused) — e.g. from the persisted last session. */
  restoreQueue(queue: TrackMeta[], index: number, pos = 0) {
    if (queue.length === 0) return;
    this.queue = [...queue];
    this.index = Math.max(0, Math.min(index, queue.length - 1));
    if (this.shuffle) this.buildShuffleOrder();
    this.pendingLoad = true;
    this.pendingSeek = Number.isFinite(pos) && pos > 1 ? pos : null;
    const track = this.current;
    const start = Number.isFinite(pos) ? Math.max(0, Math.min(pos, track?.duration || pos)) : 0;
    this.emit({ queue: [...this.queue], index: this.index, duration: track?.duration || 0, position: start, isPlaying: false });
  }

  /**
   * Autoplay: append up to `n` tracks related to the current one — shared
   * genre tags score highest, then same artist/album — skipping anything
   * already queued. Returns how many were appended.
   */
  private async extendWithSimilar(n = 10): Promise<number> {
    const seed = this.current;
    if (!seed) return 0;
    const { db } = await import("@/core/library/db");
    const all = await db.tracks.toArray();
    const exclude = new Set(this.queue.map((t) => t.id));
    const picks = pickSimilar(seed, all, exclude, n);
    for (const p of picks) this.addToQueue(p);
    if (picks.length > 0) toast(`Autoplay — ${picks.length} similar added`, "info", "オートプレイ");
    return picks.length;
  }

  // ---- fades ----------------------------------------------------------------

  /** Cancelable-in-practice volume ramp for the no-graph fallback path. */
  private rampVolume(el: HTMLAudioElement, from: number, to: number, ms: number, onDone?: () => void) {
    if (this.fadeTimer != null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    el.volume = Math.max(0, Math.min(1, from));
    const t0 = performance.now();
    this.fadeTimer = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) {
        if (this.fadeTimer != null) {
          window.clearInterval(this.fadeTimer);
          this.fadeTimer = null;
        }
        onDone?.();
      }
    }, 40);
  }

  private fadeIn(el: HTMLAudioElement, track?: TrackMeta) {
    if (!this.fadeEnabled) {
      // still land on the per-track gain base when fades are off
      const g0 = this.srcGainFor(el);
      const base = this.gainBase(track ?? this.current);
      if (g0 && this.ctx) g0.gain.value = base;
      else el.volume = this.userVolume * base;
      return;
    }
    const base = this.gainBase(track ?? this.current);
    const g = this.srcGainFor(el);
    if (g && this.ctx) {
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(base, t + FADE_MS / 1000);
    } else {
      this.rampVolume(el, 0, this.userVolume * base, FADE_MS);
    }
  }

  private async fadeOutAndPause(): Promise<void> {
    const el = this.el;
    const base = this.gainBase(this.current);
    const g = this.srcGainFor(el);
    if (g && this.ctx) {
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + FADE_MS / 1000);
      await new Promise<void>((res) => window.setTimeout(res, FADE_MS + 30));
      el.pause();
      g.gain.cancelScheduledValues(this.ctx.currentTime);
      g.gain.value = base;
    } else {
      await new Promise<void>((res) => this.rampVolume(el, el.volume, 0, FADE_MS, () => res()));
      el.pause();
      el.volume = this.userVolume * base;
    }
  }

  /** Fired from timeupdate: start an end-of-track fade or a crossfade. */
  private checkAutoTransition() {
    if (this.transitioning || this.index < 0 || this.queue.length === 0) return;
    const el = this.el;
    const d = el.duration;
    if (!Number.isFinite(d) || d <= 0 || el.paused) return;
    if (this.repeat === "one") return;
    const remaining = d - el.currentTime;
    if (this.crossfadeEnabled && this.ctx) {
      if (remaining <= this.crossfadeMs / 1000 + 0.03) void this.startCrossfade();
      return;
    }
    if (this.fadeEnabled && !this.endFading && remaining <= FADE_MS / 1000 + 0.03) {
      this.endFading = true;
      const base = this.gainBase(this.current);
      const g = this.srcGainFor(el);
      if (g && this.ctx) {
        const t = this.ctx.currentTime;
        g.gain.setValueAtTime(base, t);
        g.gain.linearRampToValueAtTime(0, t + Math.max(0.05, remaining));
      } else {
        this.rampVolume(el, el.volume, 0, Math.max(80, remaining * 1000));
      }
    }
  }

  /**
   * True crossfade: start the next track on the idle element, bring it up while
   * the outgoing one goes to silence, then adopt it as `this.el` so every UI
   * read (seek bars, time, position) follows the incoming track.
   */
  private async startCrossfade(nextIdx?: number) {
    if (!this.ctx || this.transitioning) return;
    if (this.repeat === "one") return;
    let idx =
      nextIdx ?? (this.index + 1 < this.queue.length ? this.index + 1 : this.repeat === "all" ? 0 : -1);
    if (idx < 0 && this.autoplayEnabled) {
      // queue ran dry mid-crossfade — extend with similar tracks first
      const added = await this.extendWithSimilar();
      if (added > 0) idx = this.index + 1;
    }
    if (idx < 0 || idx >= this.queue.length) return;
    const track = this.queue[idx];
    const oldEl = this.el;
    const newEl = this.inactiveEl();
    this.transitioning = true;
    if (!this.srcGainFor(newEl)) {
      try {
        this.connectElement(newEl);
      } catch (e) {
        console.warn("AudioEngine: crossfade graph init failed", e);
        this.transitioning = false;
        return;
      }
    }
    const ok = await this.resolveAndLoad(track, newEl);
    if (!ok) {
      this.transitioning = false;
      await this.next(true);
      return;
    }
    this.skipAttempts = 0;
    this.index = idx;
    this.el = newEl;
    this.emit({ queue: [...this.queue], index: idx, duration: track.duration || 0, position: 0 });
    this.updateMediaSession(track);
    try {
      await newEl.play();
    } catch (e) {
      console.warn("AudioEngine: crossfade play() rejected", e);
      this.transitioning = false;
      return;
    }
    this.bumpPlayCount(track);

    const oldGain = this.srcGainFor(oldEl);
    const newGain = this.srcGainFor(newEl);
    const inBase = this.gainBase(track);
    const outBase = this.gainBase(this.current);
    if (newGain) {
      const t = this.ctx.currentTime;
      newGain.gain.setValueAtTime(0, t);
      newGain.gain.linearRampToValueAtTime(inBase, t + this.crossfadeMs / 1000);
    } else {
      this.rampVolume(newEl, 0, this.userVolume * inBase, this.crossfadeMs);
    }
    if (oldGain) {
      const t = this.ctx.currentTime;
      oldGain.gain.setValueAtTime(outBase, t);
      oldGain.gain.linearRampToValueAtTime(0, t + this.crossfadeMs / 1000);
      window.setTimeout(() => {
        oldEl.pause();
        oldGain.gain.cancelScheduledValues(this.ctx!.currentTime);
        oldGain.gain.value = 1; // recycled as the preloader — fadeIn sets the right base later
      }, this.crossfadeMs + 40);
    } else {
      this.rampVolume(oldEl, oldEl.volume, 0, this.crossfadeMs, () => {
        oldEl.pause();
        oldEl.volume = this.userVolume * inBase;
      });
    }
    window.setTimeout(() => {
      this.transitioning = false;
    }, this.crossfadeMs + 80);
    // the outgoing element is idle again — warm up the track after this one
    const upNext = this.queue[this.orderIndexToQueue(idx + 1)];
    if (upNext) void this.resolveAndLoad(upNext, oldEl);
    this.scheduleLoudnessLearn(track);
  }
}

export const engine = new AudioEngine();
