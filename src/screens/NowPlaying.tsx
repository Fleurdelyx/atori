import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import {
  ChevronDown,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { usePlayback } from "@/core/audio/playbackStore";
import { engine } from "@/core/audio/AudioEngine";
import { useUi } from "@/state/uiStore";
import { useSkin } from "@/skins/SkinProvider";
import { fx } from "@/fx/FxDirector";
import { HoloCover } from "@/ui/kit/HoloCover";
import { GradeBadge } from "@/ui/kit/GradeBadge";
import { KineticText } from "@/ui/kit/KineticText";
import { SpectrumBars } from "@/ui/kit/SpectrumBars";
import { formatTime, isVideoFormat } from "@/core/library/types";
import { LyricsSheet } from "@/ui/kit/LyricsSheet";
import { TrackVisual } from "@/ui/kit/TrackVisual";
import { useVisual } from "@/core/library/visuals";

/** Seek bar with drag support; rAF feed while idle. */
function SeekBar() {
  const duration = usePlayback((s) => s.duration);
  const [dragPct, setDragPct] = useState<number | null>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

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

  const d = duration || 0;

  return (
    <div>
      <div
        ref={barRef}
        className="group relative h-6 cursor-pointer select-none"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDragPct(pctFromEvent(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging.current) setDragPct(pctFromEvent(e.clientX));
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          const pct = pctFromEvent(e.clientX);
          engine.seek(pct * (engine.el.duration || 0));
          setDragPct(null);
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
        {/* handle */}
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 opacity-0 transition-opacity group-hover:opacity-100"
          style={{
            left: `${(dragPct ?? 0) * 100}%`,
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

function Controls({ flat = false }: { flat?: boolean }) {
  const isPlaying = usePlayback((s) => s.isPlaying);
  const shuffle = usePlayback((s) => s.shuffle);
  const repeat = usePlayback((s) => s.repeat);
  const toggle = usePlayback((s) => s.toggle);
  const next = usePlayback((s) => s.next);
  const prev = usePlayback((s) => s.prev);
  const cycleRepeat = usePlayback((s) => s.cycleRepeat);
  const toggleShuffle = usePlayback((s) => s.toggleShuffle);

  const btn = "p-2.5 text-dim transition-colors hover:text-accent";
  return (
    <div className="flex items-center gap-3" data-testid="np-controls">
      <button aria-label="Shuffle" className={btn} onClick={toggleShuffle} style={{ color: shuffle ? "var(--ato-accent)" : undefined }}>
        <Shuffle className="h-5 w-5" />
      </button>
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
      <button aria-label={`Repeat ${repeat}`} className={btn} onClick={cycleRepeat} style={{ color: repeat !== "off" ? "var(--ato-accent)" : undefined }}>
        {repeat === "one" ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
      </button>
      <button aria-label="Queue" className={btn} onClick={() => useUi.getState().setQueueOpen(true)}>
        <ListMusic className="h-5 w-5" />
      </button>
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
          {/* readability veil over the shader — skipped in flat mode, the bg is already solid */}
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
            <button
              onClick={() => setOpen(false)}
              className="clip-tag font-mono flex items-center gap-2 px-4 py-2 text-[10px] tracking-[0.3em] text-dim backdrop-blur-md hover:text-accent"
              style={{ background: "var(--ato-panel)" }}
            >
              <ChevronDown className="h-3.5 w-3.5" /> CLOSE
            </button>
            <div className="flex items-center gap-3">
              {hasVisual && (
                <button
                  onClick={() => setTheatre(!theatre)}
                  className="font-mono rounded-full px-3 py-1 text-[9px] tracking-[0.25em] transition-colors"
                  style={{
                    border: `1px solid ${theatre ? "var(--ato-text)" : "var(--ato-border)"}`,
                    color: theatre ? "var(--ato-text)" : "var(--ato-text-dim)",
                    background: theatre ? "color-mix(in srgb, var(--ato-text) 12%, transparent)" : "transparent",
                  }}
                  title="Theatre mode — video front and center"
                >
                  THEATRE {theatre ? "✓" : ""}
                </button>
              )}
              <button
                onClick={() => setNpFlat(!flat)}
                className="font-mono rounded-full px-3 py-1 text-[9px] tracking-[0.25em] transition-colors"
                style={{
                  border: `1px solid ${flat ? "var(--ato-text)" : "var(--ato-border)"}`,
                  color: flat ? "var(--ato-text)" : "var(--ato-text-dim)",
                  background: flat ? "color-mix(in srgb, var(--ato-text) 12%, transparent)" : "transparent",
                }}
                title="Toggle the centered flat-player layout"
              >
                FLAT {flat ? "✓" : ""}
              </button>
              <div className="font-jp text-[10px] tracking-[0.6em] text-dim opacity-70">再生中 // NOW PLAYING</div>
            </div>
          </div>

          {current && theatre && hasVisual ? (
            /* THEATRE — the video owns the room, controls docked underneath */
            <main className="relative z-10 flex min-h-0 flex-1 flex-col px-6 pb-3">
              <div className="grid min-h-0 flex-1 place-items-center">
                <TrackVisual track={current} className="max-h-full w-full object-contain" rounded={false} />
              </div>
              <div className="mx-auto w-full max-w-3xl pt-3">
                <div className="flex items-baseline justify-between gap-4">
                  <h1 className="font-display min-w-0 truncate text-xl font-bold">{current.title}</h1>
                  <p className="font-jp shrink-0 truncate text-sm text-dim">{current.artist}</p>
                </div>
                <div className="mt-2">
                  <SeekBar />
                </div>
                <div className="mt-3 flex justify-center">
                  <Controls flat />
                </div>
              </div>
            </main>
          ) : current ? (
            flat ? (
              <main className="relative z-10 grid min-h-0 flex-1 place-items-center overflow-y-auto px-6 py-4">
                <div className="flex w-full max-w-md flex-col items-center text-center">
                  {hasVisual ? (
                    <TrackVisual track={current} className="aspect-square w-full max-w-[320px] object-cover" />
                  ) : (
                    <CoverStage open={open} flat />
                  )}

                  <div className="mt-7 flex items-center justify-center gap-3 text-[10px] tracking-[0.35em]">
                    <GradeBadge grade={current.grade} />
                    {current.sampleRate ? (
                      <span className="font-mono text-dim">
                        {current.format.toUpperCase()}
                        {current.bitDepth ? ` ${current.bitDepth}BIT` : ""} · {(current.sampleRate / 1000).toFixed(1)}kHz
                      </span>
                    ) : (
                      <span className="font-mono text-dim">{current.format.toUpperCase()}</span>
                    )}
                  </div>

                  <h1 className="font-display mt-3 w-full break-words text-3xl leading-tight font-bold">
                    <KineticText key={`t-${current.id}`} text={current.title} glitch={!calm} />
                  </h1>
                  <p className="font-jp mt-1.5 text-base text-dim">{current.artist}</p>

                  <div className="mt-6 w-full">
                    <SeekBar />
                  </div>
                  <div className="mt-5">
                    <Controls flat />
                  </div>

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
                  <div className="font-mono mb-3 flex items-center gap-3 text-[10px] tracking-[0.35em]">
                    <span style={{ color: "var(--ato-accent)" }}>TRACK {String(current.trackNo ?? 0).padStart(2, "0")}</span>
                    <GradeBadge grade={current.grade} />
                    {current.sampleRate ? (
                      <span className="text-dim">
                        {current.format.toUpperCase()}
                        {current.bitDepth ? ` ${current.bitDepth}BIT` : ""} ·{" "}
                        {(current.sampleRate / 1000).toFixed(1)}kHz
                        {current.bitrate ? ` · ${current.bitrate}KBPS` : ""}
                      </span>
                    ) : (
                      <span className="text-dim">{current.format.toUpperCase()}</span>
                    )}
                  </div>

                  <h1 className="font-display min-w-0 text-[clamp(28px,4.2vw,56px)] leading-[1.05] font-bold break-words">
                    <KineticText key={`t-${current.id}`} text={current.title} glitch={!calm} />
                  </h1>
                  <p className="mt-3 text-xl text-dim">
                    <KineticText key={`a-${current.id}`} text={current.artist} />
                  </p>
                  <p className="font-mono mt-1 text-[11px] tracking-[0.2em] text-dim">
                    {current.album}
                    {current.year ? ` — ${current.year}` : ""}
                  </p>

                  <div className="mt-8 max-w-xl">
                    <SeekBar />
                  </div>
                  <div className="mt-6">
                    <Controls />
                  </div>
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
                    <p className="font-mono mt-2 text-[9px] leading-relaxed tracking-[0.15em] text-dim">
                      SYNCED TO THE AUDIO — THEATRE MODE IN THE TOP BAR
                    </p>
                  </div>
                )}
              </div>
            </main>
            )
          ) : (
            <EmptyStage />
          )}

          {/* bottom spectrum strip — hidden in flat mode (nothing should move) */}
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
