import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import {
  ChevronDown,
  Heart,
  ListMusic,
  Maximize,
  Minimize,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { RepeatOneIcon } from "@/ui/kit/RepeatOneIcon";
import { usePlayback } from "@/core/audio/playbackStore";
import { useFavorites } from "@/core/cloud/favoritesStore";
import { engine } from "@/core/audio/AudioEngine";
import { useUi } from "@/state/uiStore";
import { useSkin } from "@/skins/SkinProvider";
import { fx } from "@/fx/FxDirector";
import { HoloCover } from "@/ui/kit/HoloCover";
import { GradeBadge } from "@/ui/kit/GradeBadge";
import { VolumeControl } from "@/ui/kit/VolumeControl";
import { KineticText } from "@/ui/kit/KineticText";
import { SpectrumBars } from "@/ui/kit/SpectrumBars";
import { formatTime, isVideoFormat } from "@/core/library/types";
import { LyricsSheet } from "@/ui/kit/LyricsSheet";
import { TrackVisual } from "@/ui/kit/TrackVisual";
import { useVisual } from "@/core/library/visuals";
import { inTauriShell, tauriSetFullscreen } from "@/core/library/shellIngest";

/** Seek bar with drag support; rAF feed while idle. The diamond handle
 *  auto-fades: revealed by hover/drag, gone ~1.6s after the last interaction. */
function SeekBar() {
  const duration = usePlayback((s) => s.duration);
  const fillRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
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

  useEffect(
    () => () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  // live position while not dragging
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (dragging.current || !fillRef.current) return;
      // restored-but-not-yet-loaded track: fall back to store duration/position
      const d = engine.el.duration || usePlayback.getState().duration || 0;
      const t = engine.el.duration ? engine.el.currentTime : usePlayback.getState().position;
      const pct = d > 0 ? t / d : 0;
      fillRef.current.style.transform = `scaleX(${pct.toFixed(4)})`;
      if (handleRef.current) handleRef.current.style.left = `${(pct * 100).toFixed(3)}%`;
      if (timeRef.current) timeRef.current.textContent = formatTime(t);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pctFromEvent = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const preview = (clientX: number) => {
    const pct = pctFromEvent(clientX);
    // move fill and handle together: the fill keeps its playback position
    // otherwise and visibly disagrees with the handle mid-drag
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${pct.toFixed(4)})`;
    if (handleRef.current) handleRef.current.style.left = `${(pct * 100).toFixed(3)}%`;
    return pct;
  };

  const d = duration || 0;

  return (
    <div>
      <div
        ref={barRef}
        className="group relative h-6 cursor-pointer touch-none select-none"
        onPointerEnter={wakeHandle}
        onPointerMove={(e) => {
          wakeHandle();
          if (dragging.current) preview(e.clientX);
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          preview(e.clientX);
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
        <div className="absolute top-1/2 right-0 left-0 h-[3px] -translate-y-1/2 bg-line" />
        <div
          ref={fillRef}
          className="absolute top-[calc(50%-1.5px)] left-0 h-[3px] origin-left"
          style={{
            width: "100%",
            transform: "scaleX(0)",
            background: "linear-gradient(90deg, var(--ato-accent-2), var(--ato-accent))",
          }}
        />
        {/* handle: opacity driven by wakeHandle (hover/drag, fast fade when idle) */}
        <div
          ref={handleRef}
          className="absolute top-1/2 left-0 h-3 w-3 -translate-y-1/2 rotate-45 opacity-0 transition-opacity duration-300"
          style={{
            background: "var(--ato-accent)",
            boxShadow: "0 0 12px var(--ato-accent)",
          }}
        />
      </div>
      <div className="font-mono mt-1 flex justify-between text-[10px] text-dim">
        <span ref={timeRef}>0:00</span>
        <span>{formatTime(d)}</span>
      </div>
    </div>
  );
}

/** Cover with pointer-tilt parallax (2.5D stage); flat mode = static and centered. */
function CoverStage({ open, flat = false }: { open: boolean; flat?: boolean }) {
  const current = usePlayback((s) => s.current);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 180, damping: 22 });
  const sry = useSpring(ry, { stiffness: 180, damping: 22 });

  if (!current) return null;
  if (flat) {
    return (
      <motion.div layoutId={open ? "np-cover" : undefined} className="relative mx-auto aspect-square w-full max-w-[320px]">
        <HoloCover coverKey={current.coverKey} title={current.title} grade={current.grade} className="h-full w-full" />
      </motion.div>
    );
  }
  return (
    <motion.div
      layoutId={open ? "np-cover" : undefined}
      className="relative mx-auto aspect-square w-full max-w-[380px]"
      style={{ perspective: 1000 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        ry.set(x * 14);
        rx.set(-y * 10);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
    >
      <motion.div style={{ rotateX: srx, rotateY: sry, transformStyle: "preserve-3d" }} className="h-full w-full">
        <div style={{ transform: "translateZ(0)" }} className="h-full w-full">
          <HoloCover
            coverKey={current.coverKey}
            title={current.title}
            grade={current.grade}
            className="h-full w-full shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]"
          />
        </div>
        {/* glow under the cover */}
        <div
          className="absolute -bottom-6 left-1/2 h-8 w-4/5 -translate-x-1/2 blur-2xl"
          style={{ background: "color-mix(in srgb, var(--ato-accent) 35%, transparent)" }}
        />
      </motion.div>
    </motion.div>
  );
}

function Controls({ flat = false, lead, trail }: { flat?: boolean; lead?: ReactNode; trail?: ReactNode }) {
  const isPlaying = usePlayback((s) => s.isPlaying);
  const shuffle = usePlayback((s) => s.shuffle);
  const repeat = usePlayback((s) => s.repeat);
  const toggle = usePlayback((s) => s.toggle);
  const next = usePlayback((s) => s.next);
  const prev = usePlayback((s) => s.prev);
  const cycleRepeat = usePlayback((s) => s.cycleRepeat);
  const toggleShuffle = usePlayback((s) => s.toggleShuffle);
  const current = usePlayback((s) => s.current);
  const liked = useFavorites((s) => (current ? s.keys.includes(current.path) : false));
  const toggleLiked = useFavorites((s) => s.toggle);

  const btn = "p-2.5 text-dim transition-colors hover:text-accent";
  return (
    // Spotify's 3-zone transport: like+shuffle far left, prev/play/next dead
    // center, repeat+queue far right: the play button is ALWAYS centered
    // (the 1fr side zones are equal width). Theatre docks its fullscreen
    // toggle and ESC hint into these zones via lead/trail so nothing can
    // overlap the buttons.
    // No w-full here: in theatre the cluster must shrink-wrap so the outer
    // grid can center it; wrappers provide the width everywhere else.
    <div
      className="grid grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-center"
      data-testid="np-controls"
    >
      <div className="flex items-center gap-3 justify-self-start">
        {lead}
        {current && (
          <button
            aria-label={liked ? "Unlike" : "Like"}
            className={btn}
            onClick={() => toggleLiked(current.path)}
            style={liked ? { color: "var(--ato-accent)" } : undefined}
            title={liked ? "Liked" : "Like"}
          >
            <Heart className="h-5 w-5" fill={liked ? "var(--ato-accent)" : "none"} />
          </button>
        )}
        <button aria-label="Shuffle" className={btn} onClick={toggleShuffle} style={{ color: shuffle ? "var(--ato-accent)" : undefined }}>
          <Shuffle className="h-5 w-5" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button aria-label="Previous" className={btn} onClick={prev}>
          <SkipBack className="h-7 w-7" />
        </button>
      {flat ? (
        // soft-pop circular outlined play button
        <button
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => {
            toggle();
          }}
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 transition-colors"
          style={{
            borderColor: "var(--ato-text)",
            color: "var(--ato-text)",
            background: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--ato-text) 12%, transparent)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="ml-0.5 h-7 w-7" />}
        </button>
      ) : (
        <button
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => {
            toggle();
          }}
          className="clip-slash-both flex h-16 w-24 items-center justify-center"
          style={{
            background: "var(--ato-accent)",
            color: "var(--ato-bg)",
            boxShadow: "0 0 40px color-mix(in srgb, var(--ato-accent) 50%, transparent)",
          }}
        >
          {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="ml-1 h-8 w-8" />}
        </button>
      )}
      <button aria-label="Next" className={btn} onClick={next}>
        <SkipForward className="h-7 w-7" />
      </button>
      </div>
      <div className="flex items-center gap-3 justify-self-end">
        <button aria-label={`Repeat ${repeat}`} className={btn} onClick={cycleRepeat} style={{ color: repeat !== "off" ? "var(--ato-accent)" : undefined }}>
          {repeat === "one" ? <RepeatOneIcon className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
        </button>
        <button aria-label="Queue" className={btn} onClick={() => useUi.getState().setQueueOpen(true)}>
          <ListMusic className="h-5 w-5" />
        </button>
        {trail}
      </div>
    </div>
  );
}

function EmptyStage() {
  const setNowPlayingOpen = useUi((s) => s.setNowPlayingOpen);
  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
      <p className="font-display text-2xl font-bold text-dim">Nothing is playing</p>
      <p className="font-jp text-sm text-dim">何も再生されていません</p>
      <button onClick={() => setNowPlayingOpen(false)} className="font-mono text-[11px] tracking-[0.25em] text-accent">
        ← BACK TO LIBRARY
      </button>
    </div>
  );
}

/** Smart volume status chip under the volume slider: shows the learned
 *  correction while it applies, or that a track is being measured, so the
 *  feature is visible in use. Renders nothing when smart volume is off. */
function SmartVolChip() {
  const smart = useUi((s) => s.smartVolume);
  const gainDb = usePlayback((s) => s.current?.gainDb ?? null);
  const [learning, setLearning] = useState(false);
  useEffect(() => {
    if (!smart) return;
    const t = setInterval(() => setLearning(engine.learningVolume), 1000);
    return () => clearInterval(t);
  }, [smart]);

  if (!smart) return null;
  const styled = {
    padding: "2px 8px",
    borderRadius: "9999px",
    border: "1px solid var(--ato-border)",
    color: "var(--ato-text-dim)",
  };
  if (learning && gainDb === null) {
    return (
      <div className="mt-2 flex w-full justify-center">
        <span className="font-mono animate-pulse whitespace-nowrap" style={styled} title="Smart volume is measuring this track's loudness">
          LEARNING VOL…
        </span>
      </div>
    );
  }
  if (gainDb !== null && Math.abs(gainDb) >= 0.3) {
    return (
      <div className="mt-2 flex w-full justify-center">
        <span
          className="font-mono whitespace-nowrap"
          style={{ ...styled, color: "var(--ato-accent-2)", borderColor: "var(--ato-accent-2)" }}
          title="Smart volume correction applied to this track"
        >
          SMART {gainDb > 0 ? "+" : ""}
          {gainDb.toFixed(1)}DB
        </span>
      </div>
    );
  }
  return null;
}

export function NowPlayingOverlay() {
  const open = useUi((s) => s.nowPlayingOpen);
  const setOpen = useUi((s) => s.setNowPlayingOpen);
  const current = usePlayback((s) => s.current);
  const calm = useUi((s) => s.calm);
  const npFlat = useUi((s) => s.npFlat);
  const setNpFlat = useUi((s) => s.setNpFlat);
  const skin = useSkin();
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [theatre, setTheatre] = useState(false);
  // true OS fullscreen for the theatre stage: HTML5 fullscreen in the
  // browser, plus the native window in the desktop shell
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef<HTMLElement | null>(null);

  // stay in sync with every exit path (Esc, browser UI, unmount)
  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement === stageRef.current;
      setIsFullscreen(active);
      if (!active) void tauriSetFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // leaving the overlay or theatre always drops back out of fullscreen
  useEffect(() => {
    if ((!theatre || !open) && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      void tauriSetFullscreen(false);
    }
  }, [theatre, open]);

  const toggleStageFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      void tauriSetFullscreen(false);
      return;
    }
    if (!stageRef.current) return;
    void stageRef.current
      .requestFullscreen?.()
      .catch(() => setIsFullscreen(false));
    void tauriSetFullscreen(true);
    setIsFullscreen(true); // fullscreenchange may lag a beat: optimistic
  };
  // user override wins; otherwise the skin suggests (soft-pop family = flat)
  const flat = npFlat ?? (skin.flatPlayer ?? false);
  // canvas layer: attached clip/gif or a video source file
  const attached = useVisual(current?.id ?? null);
  const hasVisual = !!current && (attached != null || !!current.hasVideo || isVideoFormat(current.format));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="now-playing"
          className="fixed inset-0 z-40 flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: calm ? 0.2 : 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* readability veil over the shader: skipped in flat mode, the bg is already solid */}
          {!flat && (
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--ato-bg) 45%, transparent) 0%, transparent 28%, transparent 60%, color-mix(in srgb, var(--ato-bg) 82%, transparent) 100%)",
              }}
            />
          )}

          {/* top bar */}
          <div className="relative z-10 flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  // with a live track, "closing" minimizes into the floating
                  // bubble (YT-premium style); CLOSE next to it skips that
                  if (current) useUi.getState().setMiniBubble(true);
                  setOpen(false);
                }}
                className="clip-tag font-mono flex items-center gap-2 px-4 py-2 text-[10px] tracking-[0.3em] text-dim backdrop-blur-md hover:text-accent"
                style={{ background: "var(--ato-panel)" }}
                title={current ? "Minimize to the floating mini player" : "Close"}
              >
                <ChevronDown className="h-3.5 w-3.5" /> {current ? "MINIMIZE" : "CLOSE"}
              </button>
              {current && (
                <button
                  onClick={() => {
                    // full close: never lands in the mini player
                    useUi.getState().setMiniBubble(false);
                    setOpen(false);
                  }}
                  className="clip-tag flex items-center px-3 py-2 text-dim backdrop-blur-md hover:text-accent"
                  style={{ background: "var(--ato-panel)" }}
                  title="Close (no mini player)"
                  aria-label="Close Now Playing"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {hasVisual && (
                <button
                  onClick={() => setTheatre(!theatre)}
                  className="np-mode-pill font-mono rounded-full px-3 py-1 text-[9px] tracking-[0.25em]"
                  style={{
                    border: `1px solid ${theatre ? "var(--ato-text)" : "color-mix(in srgb, var(--ato-text) 35%, transparent)"}`,
                    color: theatre ? "var(--ato-text)" : "color-mix(in srgb, var(--ato-text) 80%, transparent)",
                    background: theatre
                      ? "color-mix(in srgb, var(--ato-text) 12%, transparent)"
                      : "color-mix(in srgb, var(--ato-panel) 72%, transparent)",
                  }}
                  title="Theatre mode: video front and center"
                >
                  THEATRE {theatre ? "✓" : ""}
                </button>
              )}
              <button
                onClick={() => setNpFlat(!flat)}
                className="np-mode-pill font-mono rounded-full px-3 py-1 text-[9px] tracking-[0.25em]"
                style={{
                  border: `1px solid ${flat ? "var(--ato-text)" : "color-mix(in srgb, var(--ato-text) 35%, transparent)"}`,
                  color: flat ? "var(--ato-text)" : "color-mix(in srgb, var(--ato-text) 80%, transparent)",
                  background: flat
                    ? "color-mix(in srgb, var(--ato-text) 12%, transparent)"
                    : "color-mix(in srgb, var(--ato-panel) 72%, transparent)",
                }}
                title="Toggle the centered flat-player layout"
              >
                FLAT {flat ? "✓" : ""}
              </button>
              <div className="font-jp text-[10px] tracking-[0.6em] text-dim opacity-70">再生中 // NOW PLAYING</div>
            </div>
          </div>

          {current && theatre && hasVisual ? (
            /* THEATRE: the video owns the room, controls docked underneath
               over a gradient scrim so they stay readable on bright footage.
               The stage supports true fullscreen (button or double-click). */
            <main
              ref={stageRef}
              className={`relative z-10 flex min-h-0 flex-1 flex-col px-6 pb-10 ${isFullscreen ? "bg-black" : ""}`}
            >
              {/* absolute-fill keeps the video's box definite at any nesting
                  depth: percentage max-heights fail in this flex chain and
                  let the video overflow behind the controls */}
              <div
                className="relative min-h-0 flex-1"
                onDoubleClick={toggleStageFullscreen}
                title="Double-click to toggle fullscreen"
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <TrackVisual track={current} className="max-h-full max-w-full object-contain" rounded={false} />
                </div>
              </div>
              <div className="relative">
                {/* readability scrim: skin-bg gradient so light skins stay light */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-[-1.5rem] top-0 -bottom-3"
                  style={{
                    background:
                      "linear-gradient(180deg, transparent, color-mix(in srgb, var(--ato-bg) 55%, transparent) 38%, color-mix(in srgb, var(--ato-bg) 92%, transparent) 100%)",
                  }}
                />
                  <div className="relative mx-auto w-full max-w-3xl pt-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <h1 className="font-display min-w-0 truncate text-xl font-bold">{current.title}</h1>
                    <p className="font-jp shrink-0 truncate text-sm text-dim">{current.artist}</p>
                  </div>
                  <div className="mt-2">
                    <SeekBar />
                  </div>
                  <div className="relative mt-3 w-full">
                    {/* ESC hint docks INSIDE the transport's left zone */}
                    <Controls
                      flat
                      lead={
                        isFullscreen ? (
                          <span className="font-mono text-[9px] tracking-[0.25em] text-dim opacity-70">
                            ESC TO EXIT
                          </span>
                        ) : undefined
                      }
                      trail={
                        <button
                          onClick={toggleStageFullscreen}
                          className="p-2 text-dim transition-colors hover:text-accent"
                          style={{ color: isFullscreen ? "var(--ato-text)" : undefined }}
                          title="Fullscreen (double-click the video)"
                          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                        >
                          {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                        </button>
                      }
                    />
                  </div>
                  {/* volume centered under the transport: same placement as
                      flat/regular so the modes read consistently */}
                  <div className="relative mt-2 flex w-full justify-center">
                    <VolumeControl wide />
                  </div>
                </div>
              </div>
            </main>
          ) : current ? (
            flat ? (
              <main className="relative z-10 grid min-h-0 flex-1 place-items-center overflow-y-auto px-6 pt-4 pb-10">
                <div className="flex w-full max-w-md flex-col items-center text-center">
                  {hasVisual ? (
                    <TrackVisual track={current} className="aspect-square w-full max-w-[320px] object-cover" />
                  ) : (
                    <CoverStage open={open} flat />
                  )}

                  <div className="mt-7 flex items-center justify-center gap-3 text-[10px] tracking-[0.35em]">
                    <GradeBadge grade={current.grade} format={current.format} />
                    {current.sampleRate ? (
                      <span className="font-mono leading-[18px] text-dim">
                        {current.bitDepth ? `${current.bitDepth}BIT · ` : ""}
                        {(current.sampleRate / 1000).toFixed(1)}kHz
                      </span>
                    ) : null}
                  </div>

                  <h1 className="font-display mt-3 w-full break-words text-3xl leading-tight font-bold">
                    <KineticText key={`t-${current.id}`} text={current.title} glitch={!calm} />
                  </h1>
                  <p className="font-jp mt-1.5 text-base text-dim">{current.artist}</p>

                  <div className="mt-6 w-full">
                    <SeekBar />
                  </div>
                  <div className="mt-6 w-full">
                    <Controls flat />
                  </div>
                  <div className="mt-2 flex w-full justify-center">
                    <VolumeControl wide />
                  </div>
                  <SmartVolChip />

                  {current.lyrics && (
                    <div className="mt-6 w-full">
                      <button
                        onClick={() => setLyricsOpen((v) => !v)}
                        className="font-mono rounded-full px-4 py-1.5 text-[10px] tracking-[0.3em] transition-colors"
                        style={{
                          border: `1px solid ${lyricsOpen ? "var(--ato-text)" : "var(--ato-border)"}`,
                          color: lyricsOpen ? "var(--ato-text)" : "var(--ato-text-dim)",
                        }}
                      >
                        LYRICS <span className="font-jp ml-1 opacity-70">歌詞</span>
                      </button>
                      {lyricsOpen && (
                        <div
                          className="clip-notch mt-3 bg-panel p-4 text-left backdrop-blur-md"
                          style={{ border: "1px solid var(--ato-border)", borderRadius: "var(--ato-radius)" }}
                        >
                          <LyricsSheet key={current.id} raw={current.lyrics} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </main>
            ) : (
            <main className="relative z-10 grid min-h-0 flex-1 place-items-center overflow-y-auto px-[5vw] py-4">
              <div
                className="grid w-full max-w-6xl items-center gap-12 md:grid-cols-[minmax(280px,40%)_1fr]"
                style={hasVisual ? { gridTemplateColumns: "minmax(240px,32%) 1fr minmax(220px,26%)" } : undefined}
              >
                <CoverStage open={open} />
                <div className="min-w-0">
                  <div className="font-mono mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-[0.35em]">
                    <span className="whitespace-nowrap" style={{ color: "var(--ato-accent)" }}>
                      TRACK {String(current.trackNo ?? 0).padStart(2, "0")}
                    </span>
                    <GradeBadge grade={current.grade} format={current.format} className="shrink-0" />
                    {current.sampleRate ? (
                      <span className="whitespace-nowrap text-dim">
                        {current.bitDepth ? `${current.bitDepth}BIT` : ""} ·{" "}
                        {(current.sampleRate / 1000).toFixed(1)}kHz
                        {current.bitrate ? ` · ${current.bitrate}KBPS` : ""}
                      </span>
                    ) : null}
                  </div>

                  <h1 className="font-display min-w-0 text-[clamp(28px,4.2vw,56px)] leading-[1.05] font-bold break-words">
                    <KineticText key={`t-${current.id}`} text={current.title} glitch={!calm} />
                  </h1>
                  <p className="mt-3 text-xl text-dim">
                    <KineticText key={`a-${current.id}`} text={current.artist} />
                  </p>
                  <button
                    onClick={() =>
                      useUi.getState().navigate("album", `${current.album}::${current.albumArtist}`, current.source ?? "local")
                    }
                    className="font-mono mt-1 text-[11px] tracking-[0.2em] text-dim transition-colors hover:text-accent"
                    title={`Go to ${current.album}`}
                  >
                    {current.album}
                    {current.year ? ` · ${current.year}` : ""}
                  </button>

                  <div className="mt-8 max-w-xl">
                    <SeekBar />
                  </div>
                  <div className="mt-6 w-full">
                    <Controls />
                  </div>
                  <div className="mt-2 flex w-full justify-center">
                    <VolumeControl wide />
                  </div>
                  <SmartVolChip />
                  {current.lyrics && (
                    <div className="mt-6 max-w-xl">
                      <button
                        onClick={() => setLyricsOpen((v) => !v)}
                        className="clip-tag font-mono px-4 py-1.5 text-[10px] tracking-[0.3em]"
                        style={{
                          background: lyricsOpen
                            ? "var(--ato-accent)"
                            : "color-mix(in srgb, var(--ato-text) 7%, transparent)",
                          color: lyricsOpen ? "var(--ato-bg)" : "var(--ato-text-dim)",
                        }}
                      >
                        LYRICS <span className="font-jp ml-1 opacity-70">歌詞</span>
                      </button>
                      {lyricsOpen && (
                        <div
                          className="clip-notch mt-3 bg-panel p-4 backdrop-blur-md"
                          style={{ border: "1px solid var(--ato-border)" }}
                        >
                          <LyricsSheet key={current.id} raw={current.lyrics} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {hasVisual && (
                  <div className="min-w-0">
                    <div className="font-mono mb-2 text-[9px] tracking-[0.35em] text-dim">
                      VISUAL ビジュアル {attached?.kind === "gif" ? "// GIF" : attached ? "// CLIP" : "// VIDEO"}
                    </div>
                    <TrackVisual track={current} className="w-full" />
                  </div>
                )}
              </div>
            </main>
            )
          ) : (
            <EmptyStage />
          )}

          {/* bottom spectrum strip: hidden in flat mode (nothing should move) */}
          {!flat && (
            <div className="relative z-10 px-10 pb-6">
              <SpectrumBars className="mx-auto max-w-3xl opacity-80" height={44} />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
