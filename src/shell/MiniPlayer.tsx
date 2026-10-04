import { useEffect, useRef, useState } from "react";
import {
  ChevronsDown,
  ListMusic,
  MicVocal,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { usePlayback } from "@/core/audio/playbackStore";
import { engine } from "@/core/audio/AudioEngine";
import { useUi } from "@/state/uiStore";
import { HoloCover } from "@/ui/kit/HoloCover";
import { GradeBadge } from "@/ui/kit/GradeBadge";
import { LyricsSheet } from "@/ui/kit/LyricsSheet";
import { VolumeControl as SharedVolumeControl } from "@/ui/kit/VolumeControl";
import { RepeatOneIcon } from "@/ui/kit/RepeatOneIcon";
import { formatTime } from "@/core/library/types";

/** Slim progress line across the top of the mini player. rAF-driven, draggable
 *  to seek. Diamond handle auto-fades like the Now Playing seek bars. */
function ProgressLine() {
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const hideTimer = useRef<number | null>(null);

  const wakeHandle = () => {
    if (handleRef.current) handleRef.current.style.opacity = "1";
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      if (handleRef.current && !dragging.current) handleRef.current.style.opacity = "0";
    }, 1000);
  };

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const fill = fillRef.current;
      if (!fill || dragging.current) return;
      // restored-but-not-yet-loaded track: fall back to store duration/position
      const d = engine.el.duration || usePlayback.getState().duration || 0;
      const t = engine.el.duration ? engine.el.currentTime : usePlayback.getState().position;
      const p = d > 0 ? Math.min(1, t / d) : 0;
      fill.style.transform = `scaleX(${p.toFixed(4)})`;
      if (handleRef.current) handleRef.current.style.left = `${(p * 100).toFixed(3)}%`;
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  const pctFromEvent = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const paint = (pct: number) => {
    const fill = fillRef.current;
    if (fill) fill.style.transform = `scaleX(${pct.toFixed(4)})`;
    if (handleRef.current) handleRef.current.style.left = `${(pct * 100).toFixed(3)}%`;
  };

  return (
    <div
      ref={barRef}
      className="group absolute top-0 right-0 left-0 z-10 flex h-4 cursor-pointer touch-none items-end select-none"
      title="Seek"
      onPointerEnter={wakeHandle}
      onPointerMove={(e) => {
        wakeHandle();
        if (dragging.current) paint(pctFromEvent(e.clientX));
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        paint(pctFromEvent(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        engine.seek(pctFromEvent(e.clientX) * (engine.el.duration || 0));
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      {/* visual 2px line, sits at the bottom of a taller hit area */}
      <div className="absolute top-0 right-0 left-0 h-[2px] bg-line transition-[height] group-hover:h-[3px]">
        <div
          ref={fillRef}
          className="h-full origin-left"
          style={{ background: "var(--ato-accent)", transform: "scaleX(0)" }}
        />
      </div>
      {/* diamond handle: opacity driven by wakeHandle (hover/drag, fades when idle);
          centered on the 2px line (line center ≈ 1px from the top) */}
      <div
        ref={handleRef}
        className="absolute top-[1px] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 opacity-0 transition-opacity duration-300"
        style={{
          left: "0%",
          background: "var(--ato-accent)",
          boxShadow: "0 0 10px var(--ato-accent)",
        }}
      />
    </div>
  );
}

/** Title marquee: scrolls only when the text overflows its fixed-width box,
 *  so long filenames never reshape the bar. Static under calm mode. */
function Marquee({ text, className = "" }: { text: string; className?: string }) {
  const calm = useUi((s) => s.calm);
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const el = textRef.current;
    if (!box || !el) return;
    const apply = () => {
      const overflow = el.scrollWidth - box.clientWidth;
      if (calm || overflow <= 4) {
        el.style.animation = "";
        return;
      }
      // ~28px/s pacing, clamped, with a 1s read-the-start delay
      const duration = Math.min(24, Math.max(6, overflow / 28));
      el.style.setProperty("--marquee-x", `-${overflow + 24}px`);
      el.style.animation = `marquee ${duration}s ease-in-out 1s infinite alternate`;
    };
    apply();
    document.fonts?.ready?.then(apply).catch(() => {});
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(apply);
      ro.observe(box);
      return () => {
        ro.disconnect();
        el.style.animation = "";
      };
    }
    return () => {
      el.style.animation = "";
    };
  }, [text, calm]);

  return (
    <span ref={boxRef} className={`block overflow-hidden whitespace-nowrap ${className}`}>
      <span ref={textRef} className="inline-block will-change-transform">
        {text}
      </span>
    </span>
  );
}

export function MiniPlayer() {
  const current = usePlayback((s) => s.current);
  // the floating bubble replaces the bottom bar while it's up (one mini
  // player at a time, YT-style)
  const bubble = useUi((s) => s.miniBubble);
  const isPlaying = usePlayback((s) => s.isPlaying);
  const shuffle = usePlayback((s) => s.shuffle);
  const repeat = usePlayback((s) => s.repeat);
  const toggle = usePlayback((s) => s.toggle);
  const next = usePlayback((s) => s.next);
  const prev = usePlayback((s) => s.prev);
  const cycleRepeat = usePlayback((s) => s.cycleRepeat);
  const toggleShuffle = usePlayback((s) => s.toggleShuffle);
  const setNowPlayingOpen = useUi((s) => s.setNowPlayingOpen);
  const setQueueOpen = useUi((s) => s.setQueueOpen);
  const [lyricsOpen, setLyricsOpen] = useState(false);

  // Escape closes the lyrics panel alongside its X
  useEffect(() => {
    if (!lyricsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLyricsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lyricsOpen]);

  const position = usePlayback((s) => s.position);
  const duration = usePlayback((s) => s.duration);

  if (bubble) return null;

  return (
    <footer
      className="relative z-30 border-t border-line bg-panel backdrop-blur-md"
      onWheel={(e) => {
        // scroll anywhere on the player bar to adjust volume
        const dir = e.deltaY < 0 ? 1 : -1;
        const v = usePlayback.getState().volume;
        usePlayback.getState().setVolume(Math.min(1, Math.max(0, Number((v + dir * 0.05).toFixed(2)))));
      }}
    >
      {/* lyrics panel: slides up over the app, docked to the bar */}
      {lyricsOpen && (
        <div className="absolute right-0 bottom-full left-0 z-20 border-t border-line bg-panel backdrop-blur-md">
          <div className="mx-auto max-w-2xl px-6 py-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[9px] tracking-[0.3em] text-dim">LYRICS 歌詞</span>
              <button
                onClick={() => setLyricsOpen(false)}
                className="text-dim hover:text-accent"
                title="Close lyrics"
                aria-label="Close lyrics"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {current?.lyrics ? (
              <LyricsSheet key={current.id} raw={current.lyrics} />
            ) : (
              <p className="font-jp py-6 text-center text-sm text-dim">
                No lyrics for this track <span className="ml-1 opacity-60">歌詞が見つかりません</span>
              </p>
            )}
          </div>
        </div>
      )}
      <ProgressLine />
      <div className="flex h-[76px] items-center gap-4 px-5">
        {current ? (
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setNowPlayingOpen(true)}>
            <span className="relative shrink-0">
              <HoloCover
                coverKey={current.coverKey}
                title={current.title}
                grade={current.grade}
                layoutId="np-cover"
                className="h-12 w-12"
              />
              {/* rarity rides the artwork's corner, gacha-style */}
              <GradeBadge
                grade={current.grade} format={current.format}
                className="absolute -right-1.5 -bottom-1.5 hidden drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)] md:flex"
              />
            </span>
            <span className="flex w-44 min-w-0 flex-col sm:w-60 lg:w-80">
              <Marquee text={current.title} className="text-sm font-semibold" />
              <span className="truncate text-xs text-dim">{current.artist}</span>
            </span>
          </button>
        ) : (
          <div className="font-mono min-w-0 text-[11px] tracking-[0.25em] text-dim">
            NOTHING PLAYING // キューは空
          </div>
        )}

        {/* transport */}
        <div className="mx-auto flex items-center gap-2">
          <button
            onClick={toggleShuffle}
            className="p-2 text-dim hover:text-accent"
            style={{ color: shuffle ? "var(--ato-accent)" : undefined }}
            title="Shuffle"
          >
            <Shuffle className="h-4 w-4" />
          </button>
          <button onClick={prev} className="p-2 hover:text-accent" title="Previous">
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              toggle();
            }}
            className="clip-notch flex h-11 w-14 items-center justify-center"
            style={{
              background: "var(--ato-accent)",
              color: "var(--ato-bg)",
              boxShadow: "0 0 24px color-mix(in srgb, var(--ato-accent) 45%, transparent)",
            }}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>
          <button onClick={next} className="p-2 hover:text-accent" title="Next">
            <SkipForward className="h-5 w-5" />
          </button>
          <button
            onClick={cycleRepeat}
            className="p-2 text-dim hover:text-accent"
            style={{ color: repeat !== "off" ? "var(--ato-accent)" : undefined }}
            title={`Repeat: ${repeat}`}
          >
            {repeat === "one" ? <RepeatOneIcon className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </button>
        </div>

        {/* right side: time, queue, volume, expand */}
        <div className="flex items-center gap-4">
          {current && (
            <span className="font-mono hidden text-[11px] text-dim lg:inline">
              {formatTime(position)} / {formatTime(duration)}
            </span>
          )}
          <VolumeControl />
          <button
            onClick={() => setLyricsOpen((v) => !v)}
            className="clip-tag hidden px-3 py-1.5 md:block"
            style={{
              background: "color-mix(in srgb, var(--ato-accent-2) 12%, transparent)",
              color: lyricsOpen ? "var(--ato-accent)" : undefined,
            }}
            title="Lyrics"
            aria-label="Toggle lyrics"
          >
            <MicVocal className="h-4 w-4" />
          </button>
          <button
            onClick={() => setQueueOpen(true)}
            className="clip-tag hidden px-3 py-1.5 text-dim hover:text-accent md:block"
            style={{ background: "color-mix(in srgb, var(--ato-accent-2) 12%, transparent)" }}
            title="Queue"
            aria-label="Open queue"
          >
            <ListMusic className="h-4 w-4" />
          </button>
          <button
            onClick={() => setNowPlayingOpen(true)}
            className="clip-tag px-3 py-1.5 text-dim hover:text-accent"
            style={{ background: "color-mix(in srgb, var(--ato-accent-2) 12%, transparent)" }}
            title="Open Now Playing"
          >
            <ChevronsDown className="h-4 w-4 rotate-180" />
          </button>
        </div>
      </div>
    </footer>
  );
}

function VolumeControl() {
  return (
    <div className="hidden md:flex">
      <SharedVolumeControl />
    </div>
  );
}

export { engine };
