import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Pause, Play, SkipForward, X } from "lucide-react";
import { usePlayback } from "@/core/audio/playbackStore";
import { engine } from "@/core/audio/AudioEngine";
import { useUi } from "@/state/uiStore";
import { useSkin } from "@/skins/SkinProvider";
import { HoloCover } from "@/ui/kit/HoloCover";
import { resolveVisualSource, type VisualSource } from "@/core/library/visuals";
import { formatTime } from "@/core/library/types";

const POS_KEY = "atori:bubblePos";
const W = 300;
const H = 96;

/** saved bubble position, clamped to the current viewport (eager: the card
 *  renders in the right place on its very first frame) */
function initialPos(): { x: number; y: number } {
  const clamp = (x: number, y: number) => ({
    x: Math.min(Math.max(8, x), window.innerWidth - W - 8),
    y: Math.min(Math.max(8, y), window.innerHeight - H - 8),
  });
  try {
    const raw = localStorage.getItem(POS_KEY);
    const saved = raw ? (JSON.parse(raw) as { x: number; y: number }) : null;
    if (saved) return clamp(saved.x, saved.y);
  } catch {
    /* private mode: fall through to the default corner */
  }
  return clamp(window.innerWidth - W - 24, window.innerHeight - H - 24);
}

/** YT-premium-style floating mini player: Now Playing minimized into a
 *  draggable card that keeps the track's clip/gif/video alive. Tap the art
 *  (or the chevron) to reopen Now Playing; X dismisses to the bottom bar. */
export function MiniBubble() {
  const open = useUi((s) => s.miniBubble);
  const setOpen = useUi((s) => s.setMiniBubble);
  const npOpen = useUi((s) => s.nowPlayingOpen);
  const current = usePlayback((s) => s.current);
  const isPlaying = usePlayback((s) => s.isPlaying);
  const toggle = usePlayback((s) => s.toggle);
  const next = usePlayback((s) => s.next);
  const skin = useSkin();
  const cardRef = useRef<HTMLDivElement>(null);
  // drag state in refs: no re-render per move
  const pos = useRef<{ x: number; y: number } | null>(initialPos());
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [visual, setVisual] = useState<VisualSource | null>(null);
  const ownedUrl = useRef<string | null>(null);

  const show = open && !!current && !npOpen;

  function paintPos() {
    const p = pos.current;
    if (p && cardRef.current) {
      cardRef.current.style.left = `${p.x}px`;
      cardRef.current.style.top = `${p.y}px`;
    }
  }

  // drag: pointer capture on the card, buttons opt out via data-nodrag
  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-nodrag]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = pos.current!;
    drag.current = { dx: e.clientX - p.x, dy: e.clientY - p.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const card = cardRef.current;
    const w = card?.offsetWidth ?? W;
    const h = card?.offsetHeight ?? H;
    pos.current = {
      x: Math.min(Math.max(8, e.clientX - d.dx), window.innerWidth - w - 8),
      y: Math.min(Math.max(8, e.clientY - d.dy), window.innerHeight - h - 8),
    };
    paintPos();
  }
  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos.current));
    } catch {
      /* private mode: position just doesn't persist */
    }
  }

  // the track's visual layer: attached clip/gif loops; video files follow
  // the audio clock (resynced below)
  useEffect(() => {
    if (!show || !current) {
      setVisual(null);
      return;
    }
    let alive = true;
    void resolveVisualSource(current).then((v) => {
      if (!alive) {
        if (v?.owned) URL.revokeObjectURL(v.url);
        return;
      }
      ownedUrl.current = v?.owned ? v.url : null;
      setVisual(v);
    });
    return () => {
      alive = false;
      if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current);
      ownedUrl.current = null;
      setVisual(null);
    };
  }, [show, current?.id]);

  // video playback follows the audio: play/pause + drift resync
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !visual) return;
    if (visual.kind === "video") {
      if (isPlaying) void v.play().catch(() => {});
      else v.pause();
      const sync = () => {
        const t = engine.el.currentTime;
        if (Math.abs(v.currentTime - t) > 0.4) v.currentTime = t;
      };
      const id = window.setInterval(sync, 900);
      return () => window.clearInterval(id);
    }
    if (isPlaying) void v.play().catch(() => {});
    else v.pause();
  }, [isPlaying, visual]);

  // progress fill (rAF like the other transport bars) + elapsed readout
  useEffect(() => {
    if (!show) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const fill = fillRef.current;
      if (!fill) return;
      const d = engine.el.duration || usePlayback.getState().duration || 0;
      const t = engine.el.duration ? engine.el.currentTime : usePlayback.getState().position;
      if (fill) fill.style.transform = `scaleX(${(d > 0 ? Math.min(1, t / d) : 0).toFixed(4)})`;
      if (timeRef.current) timeRef.current.textContent = formatTime(t);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [show]);

  function seek(e: React.PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!rect.width) return;
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const d = engine.el.duration || usePlayback.getState().duration || 0;
    if (d > 0) engine.seek(pct * d);
  }

  return (
    <AnimatePresence>
      {show && current && (
        <motion.div
          ref={cardRef}
          className="clip-notch fixed z-[55] touch-none select-none backdrop-blur-xl"
          style={{
            left: pos.current!.x,
            top: pos.current!.y,
            width: W,
            border: "1px solid var(--ato-border)",
            boxShadow: "0 18px 50px rgba(0,0,0,.55)",
            background: "color-mix(in srgb, var(--ato-panel) 88%, var(--ato-bg))",
          }}
          initial={{ opacity: 0, y: 90, scale: 0.85, rotate: -2 }}
          animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, y: 70, scale: 0.9 }}
          transition={{ type: "spring", stiffness: skin.motion.spring.stiffness, damping: skin.motion.spring.damping + 4 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex items-stretch gap-3 p-3">
            {/* art / live visual: tap to reopen Now Playing */}
            <button
              data-nodrag
              onClick={() => {
                setOpen(false);
                useUi.getState().setNowPlayingOpen(true);
              }}
              className="group/art relative h-[72px] w-[72px] shrink-0 overflow-hidden"
              style={{ borderRadius: "var(--ato-radius)" }}
              title="Open Now Playing"
              aria-label="Open Now Playing"
            >
              {visual ? (
                <video
                  ref={videoRef}
                  src={visual.url}
                  muted
                  playsInline
                  loop={visual.loop}
                  className="h-full w-full object-cover"
                />
              ) : (
                <HoloCover coverKey={current.coverKey} title={current.title} className="h-full w-full" rounded={false} />
              )}
              <span className="absolute inset-0 hidden items-center justify-center group-hover/art:flex" style={{ background: "rgba(0,0,0,.4)" }}>
                <ChevronDown className="h-5 w-5 rotate-180 text-white" />
              </span>
            </button>

            <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{current.title}</div>
                <div className="truncate text-[11px] text-dim">{current.artist}</div>
              </div>

              {/* seek line + elapsed */}
              <div
                data-nodrag
                className="group my-1 flex h-2 cursor-pointer touch-none items-center"
                title="Seek"
                onPointerDown={seek}
              >
                <div className="h-[3px] w-full overflow-hidden" style={{ background: "var(--ato-border)" }}>
                  <div
                    ref={fillRef}
                    className="h-full w-full origin-left"
                    style={{ background: "var(--ato-accent)", transform: "scaleX(0)" }}
                  />
                </div>
              </div>

              <div className="font-mono flex items-center justify-between text-[9px] text-dim">
                <span ref={timeRef}>0:00</span>
                <div data-nodrag className="-mr-1 flex items-center gap-0.5">
                  <button
                    onClick={toggle}
                    className="rounded-full p-2"
                    style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button onClick={next} className="p-2 text-dim hover:text-accent" aria-label="Next">
                    <SkipForward className="h-4 w-4" />
                  </button>
                  <button onClick={() => setOpen(false)} className="p-2 text-dim hover:text-accent" aria-label="Dismiss mini player">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
