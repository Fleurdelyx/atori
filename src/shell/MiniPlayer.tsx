import { useEffect, useRef, type CSSProperties } from "react";
import {
  ChevronsDown,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { usePlayback } from "@/core/audio/playbackStore";
import { engine } from "@/core/audio/AudioEngine";
import { useUi } from "@/state/uiStore";
import { HoloCover } from "@/ui/kit/HoloCover";
import { GradeBadge } from "@/ui/kit/GradeBadge";
import { formatTime } from "@/core/library/types";

/** Slim progress line across the top of the mini player. rAF-driven, draggable to seek. */
function ProgressLine() {
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

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
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pctFromEvent = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const paint = (pct: number) => {
    const fill = fillRef.current;
    if (fill) fill.style.transform = `scaleX(${pct.toFixed(4)})`;
  };

  return (
    <div
      ref={barRef}
      className="group absolute top-0 right-0 left-0 z-10 flex h-4 cursor-pointer items-end select-none"
      title="Seek"
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        paint(pctFromEvent(e.clientX));
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        paint(pctFromEvent(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        engine.seek(pctFromEvent(e.clientX) * (engine.el.duration || 0));
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
    </div>
  );
}

export function MiniPlayer() {
  const current = usePlayback((s) => s.current);
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

  const position = usePlayback((s) => s.position);
  const duration = usePlayback((s) => s.duration);

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
      <ProgressLine />
      <div className="flex h-[76px] items-center gap-4 px-5">
        {current ? (
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setNowPlayingOpen(true)}>
            <HoloCover
              coverKey={current.coverKey}
              title={current.title}
              grade={current.grade}
              layoutId="np-cover"
              className="h-12 w-12 shrink-0"
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{current.title}</span>
              <span className="truncate text-xs text-dim">{current.artist}</span>
            </span>
            <GradeBadge grade={current.grade} className="ml-1 hidden md:inline-block" />
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
            {repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
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
  const volume = usePlayback((s) => s.volume);
  const setVolume = usePlayback((s) => s.setVolume);
  const muteToggle = usePlayback((s) => s.muteToggle);
  const muted = volume === 0;
  return (
    <label className="hidden items-center gap-2 md:flex" title="Volume (scroll to adjust)">
      <button
        onClick={() => muteToggle()}
        className="cursor-pointer text-dim transition-colors hover:text-accent"
        title={muted ? "Unmute" : "Mute"}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        className="ato-slider w-24 cursor-pointer"
        style={{ "--fill": `${(volume * 100).toFixed(1)}%` } as CSSProperties}
      />
    </label>
  );
}

export { engine };
