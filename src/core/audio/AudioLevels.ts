/**
 * AudioLevels: single FFT tap over the AudioEngine's AnalyserNode.
 * Computes 32 log-spaced bands + bass/mid/treble/level envelopes,
 * smoothed with punchy decay. Consumers poll these values inside
 * their own rAF loops: never through React state.
 */
class AudioLevels {
  analyser: AnalyserNode | null = null;
  bands = new Float32Array(32);
  bass = 0;
  mid = 0;
  treble = 0;
  level = 0;

  private data = new Uint8Array(1024);
  private raf = 0;
  /** unrouted playback (touch devices): no analyser exists, so the tick
   *  synthesizes gentle levels while this reports "audible right now" */
  private synthetic: (() => boolean) | null = null;

  attach(analyser: AnalyserNode) {
    this.analyser = analyser;
    this.data = new Uint8Array(analyser.frequencyBinCount);
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  detach() {
    this.analyser = null;
  }

  /** Enable fake audio-reactivity for devices that play without a graph.
   *  The callback reports play state so the bands rest at silence when paused. */
  setSynthetic(audible: () => boolean) {
    this.synthetic = audible;
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  dispose() {
    this.detach();
    this.synthetic = null;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /**
   * Median RMS over a sampling window (ms): used by smart volume to learn a
   * track's loudness. Time-domain (post-EQ), sampled on the poll interval.
   */
  async sampleRms(ms = 3000): Promise<number | null> {
    if (!this.analyser) return null;
    const buf = new Float32Array(this.analyser.fftSize);
    const samples: number[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      this.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      samples.push(Math.sqrt(sum / buf.length));
      await new Promise((r) => setTimeout(r, 50));
    }
    if (samples.length === 0) return null;
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)];
  }

  private tick = () => {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.data as Uint8Array<ArrayBuffer>);
      const n = this.data.length;
      // 32 log-spaced bands
      for (let i = 0; i < 32; i++) {
        const lo = Math.max(1, Math.floor(Math.pow(n, i / 32)));
        const hi = Math.max(lo + 1, Math.floor(Math.pow(n, (i + 1) / 32)));
        let sum = 0;
        for (let j = lo; j < hi; j++) sum += this.data[j];
        const v = sum / (hi - lo) / 255;
        // punchy attack, smooth decay
        this.bands[i] = Math.max(v, this.bands[i] * 0.82);
      }
    } else if (this.synthetic) {
      // unrouted fallback: slow breathing swells (amplitude-safe pacing), a
      // soft bass lead with shimmering mids/treble, silence while paused
      const on = this.synthetic();
      const t = performance.now() / 1000;
      const swell = (f: number, ph: number) => (on ? Math.max(0, Math.sin(t * f + ph)) : 0);
      const bass = swell(0.55, 0) * 0.42;
      const mid = swell(0.9, 2.1) * 0.22;
      const treble = swell(1.4, 4.2) * 0.12;
      for (let i = 0; i < 32; i++) {
        const base = i < 8 ? bass : i < 20 ? mid : treble;
        const jitter = on ? Math.abs(Math.sin(t * (1.7 + i * 0.31) + i * 2.1)) * 0.06 : 0;
        const v = base + jitter;
        this.bands[i] = Math.max(v, this.bands[i] * 0.82);
      }
    }
    const avg = (a: Float32Array, from: number, to: number) => {
      let s = 0;
      for (let i = from; i < to; i++) s += a[i];
      return s / (to - from);
    };
    const bass = avg(this.bands, 0, 6);
    const mid = avg(this.bands, 6, 20);
    const treble = avg(this.bands, 20, 32);
    const level = avg(this.bands, 0, 32);
    this.bass += (bass - this.bass) * 0.3;
    this.mid += (mid - this.mid) * 0.3;
    this.treble += (treble - this.treble) * 0.3;
    this.level += (level - this.level) * 0.25;
    this.raf = requestAnimationFrame(this.tick);
  };
}

export const audioLevels = new AudioLevels();
