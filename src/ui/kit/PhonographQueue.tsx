import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Disc3, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { usePlayback } from "@/core/audio/playbackStore";
import { useUi } from "@/state/uiStore";
import { loadCoverUrl } from "@/core/library/coverCache";
import { formatTime, type TrackMeta } from "@/core/library/types";
import { LogoMark } from "./LogoMark";

/** Phonograph queue body: vinyl stage + node-rail track list (Arknights-style).
 *  Rendered inside QueuePanel's wide aside; owns no open/close state. */
export function PhonographQueue() {
  const current = usePlayback((s) => s.current);
  const queue = usePlayback((s) => s.queue);
  const index = usePlayback((s) => s.index);
  return (
    <div className="flex min-h-0 flex-1">
      <section className="relative hidden min-h-0 flex-col overflow-hidden @[720px]:flex @[720px]:w-[58%]">
        {current ? <DiscStage current={current} /> : <StageIdle />}
      </section>
      <section
        className="flex min-h-0 flex-1 flex-col"
        style={{ borderLeft: "1px solid var(--ato-border)" }}
      >
        <Rail current={current} queue={queue} index={index} />
      </section>
    </div>
  );
}

/* ---------------------------------- stage --------------------------------- */

function StageIdle() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <p className="text-center font-mono text-[11px] tracking-[0.3em] text-dim">
        NO DISC · 何も再生されていません
      </p>
    </div>
  );
}

function DiscStage({ current }: { current: TrackMeta }) {
  const isPlaying = usePlayback((s) => s.isPlaying);
  const position = usePlayback((s) => s.position);
  const duration = usePlayback((s) => s.duration);
  const index = usePlayback((s) => s.index);
  const toggle = usePlayback((s) => s.toggle);
  const next = usePlayback((s) => s.next);
  const prev = usePlayback((s) => s.prev);
  const calm = useUi((s) => s.calm);
  const cover = useCoverUrl(current.coverKey);
  const spinning = isPlaying && !calm;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* giant background title: wraps downward and clips at the stage bottom
          (the section's overflow-hidden), no horizontal ellipsis */}
      <div aria-hidden className="pointer-events-none absolute top-8 left-5 right-5">
        <div
          className="font-display text-[clamp(32px,3.2vw,56px)] leading-[0.95] font-bold tracking-wide uppercase break-words"
          style={{ color: "color-mix(in srgb, var(--ato-text) 13%, transparent)" }}
        >
          {current.title}
        </div>
      </div>

      {/* disc + flanking accent arcs; the info card spans the stage underneath,
          its text parked at both edges so the disc only ever covers card middle */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <InfoCard current={current} playNo={index + 1} />
        {/* disc and arcs share one shifted wrapper so they can never misalign */}
        <div className="relative z-10 translate-x-[5%]">
          <Arcs />
          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: calm ? 0.15 : 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 rounded-full"
            style={{
              width: "min(36vh, 300px)",
              height: "min(36vh, 300px)",
              boxShadow: "0 18px 50px rgba(0,0,0,.55)",
            }}
          >
            {/* the spinning platter: grooves + rotating sheen + center label */}
            <div
              className="phono-disc h-full w-full rounded-full"
              style={{
                animationPlayState: spinning ? "running" : "paused",
                background: [
                  "conic-gradient(from 20deg, transparent 0deg, rgba(255,255,255,0.05) 38deg, transparent 84deg)",
                  "repeating-radial-gradient(circle, #0a0a0e 0px, #0a0a0e 2px, #15151d 3px, #0a0a0e 4px)",
                ].join(", "),
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
              }}
            >
              {/* center label = cover art */}
              <div
                className="absolute top-1/2 left-1/2 h-[36%] w-[36%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
                style={{
                  background: "linear-gradient(135deg, var(--ato-accent), var(--ato-accent-2))",
                  boxShadow: "0 0 0 2px rgba(255,255,255,0.08)",
                }}
              >
                {cover ? (
                  <img src={cover} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <span className="font-display flex h-full w-full items-center justify-center text-2xl font-bold text-white/90">
                    {current.title.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            {/* spindle cap (static) */}
            <div
              className="absolute top-1/2 left-1/2 z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: "var(--ato-bg)", boxShadow: "0 0 0 1.5px rgba(255,255,255,0.25)" }}
            />
          </motion.div>
        </div>
      </div>

      {/* transport: Spotify 3-zone: cluster dead center, time right */}
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-3"
        style={{ borderTop: "1px solid var(--ato-border)" }}
      >
        <span />
        <div className="flex items-center gap-3">
          <TransportButton label="Previous" onClick={prev}>
            <SkipBack className="h-4 w-4" />
          </TransportButton>
          <button
            onClick={toggle}
            aria-label={isPlaying ? "Pause" : "Play"}
            className={calm ? "flex h-10 w-14 items-center justify-center" : "clip-slash-both flex h-10 w-14 items-center justify-center"}
            style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <TransportButton label="Next" onClick={next}>
            <SkipForward className="h-4 w-4" />
          </TransportButton>
        </div>
        <span className="font-mono text-right text-[10px] text-dim">
          {formatTime(position)} <span className="opacity-50">/ {formatTime(duration)}</span>
        </span>
      </div>
    </div>
  );
}

function TransportButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center text-dim transition-colors hover:text-accent"
      style={{ border: "1px solid var(--ato-border)" }}
    >
      {children}
    </button>
  );
}

/** wide info card under the disc: text parked at the card's edges so the
 *  platter only ever covers the bare middle (reference layout) */
function InfoCard({ current, playNo }: { current: TrackMeta; playNo: number }) {
  return (
    <div
      className="clip-notch absolute top-1/2 right-5 left-5 z-0 -translate-y-1/2"
      style={{
        background: "color-mix(in srgb, var(--ato-panel) 92%, transparent)",
        border: "1px solid var(--ato-border)",
        padding: "16px 18px",
        minHeight: 168,
      }}
    >
      <div className="flex h-full items-stretch justify-between" style={{ minHeight: 136 }}>
        {/* left column */}
        <div className="flex min-w-0 flex-col justify-between">
          <span className="font-display text-[11px] font-bold tracking-[0.14em]">PHONOGRAPH</span>
          <div>
            <div className="font-mono text-[9px] tracking-[0.3em] text-dim">MUSIC</div>
            <div
              className="font-display text-4xl leading-none font-bold"
              style={{ color: "color-mix(in srgb, var(--ato-text) 55%, transparent)" }}
            >
              {String(playNo).padStart(2, "0")}
            </div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold">{current.artist}</div>
            <div className="truncate text-[10px] text-dim">{current.album}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** two accent arcs flanking the disc: thin parenthesis strokes that share
 *  the disc's shifted wrapper, so they always track its position */
function Arcs() {
  const R = 51; // viewBox radius trick: arc slightly larger than the disc
  const C = 2 * Math.PI * R;
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      className="pointer-events-none absolute top-1/2 left-1/2 h-[calc(min(36vh,300px)+40px)] w-[calc(min(36vh,300px)+40px)] -translate-x-1/2 -translate-y-1/2"
      style={{ color: "var(--ato-accent)", opacity: 0.55 }}
    >
      <circle
        cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"
        strokeDasharray={`${C * 0.14} ${C}`} transform="rotate(132 50 50)"
      />
      <circle
        cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"
        strokeDasharray={`${C * 0.14} ${C}`} transform="rotate(-42 50 50)"
      />
    </svg>
  );
}

/* ----------------------------------- rail ---------------------------------- */

function Rail({
  current,
  queue,
  index,
}: {
  current: TrackMeta | null;
  queue: TrackMeta[];
  index: number;
}) {
  const shuffle = usePlayback((s) => s.shuffle);
  const jumpTo = usePlayback((s) => s.jumpTo);
  const removeFromQueue = usePlayback((s) => s.removeFromQueue);
  const moveInQueue = usePlayback((s) => s.moveInQueue);
  const upNext = usePlayback((s) => s.upNextEntries);
  const calm = useUi((s) => s.calm);
  const setOpen = useUi((s) => s.setQueueOpen);
  // panel-relative drag state over the upcoming list (absolute index = index + 1 + i)
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const history = index > 0 ? queue.slice(0, index) : [];
  const upcoming = current ? upNext() : [];
  const currentRef = useRef<HTMLDivElement | null>(null);

  // keep the playing node in view: on open and on every track change
  useEffect(() => {
    currentRef.current?.scrollIntoView({
      block: "nearest",
      behavior: calm ? "auto" : "smooth",
    });
  }, [current?.id, calm]); // eslint-disable-line react-hooks/exhaustive-deps

  const dropOn = (targetPanel: number) => {
    if (dragFrom === null || dragFrom === targetPanel) {
      setDragFrom(null);
      setDragOver(null);
      return;
    }
    const fromAbs = index + 1 + dragFrom;
    // `to` is the insertion slot AFTER removal (see engine.moveInQueue)
    const toAbs = dragFrom < targetPanel ? index + targetPanel : index + targetPanel + 1;
    moveInQueue(fromAbs, toAbs);
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <>
      {/* the rail's own header pairs with the disc stage: below the stage's
          720px breakpoint the QUEUE panel header alone drives (no double X) */}
      <header className="hidden items-center justify-between px-5 py-4 @[720px]:flex" style={{ borderBottom: "1px solid var(--ato-border)" }}>
        <div className="flex items-center gap-3">
          <LogoMark className="h-7 w-7" />
          <span className="font-display text-base font-bold tracking-[0.22em]">PHONOGRAPH</span>
          <span className="font-mono text-[10px] text-dim">{queue.length}</span>
        </div>
        <button onClick={() => setOpen(false)} className="p-1 text-dim hover:text-accent" aria-label="Close queue">
          <X className="h-4 w-4" />
        </button>
      </header>

      {!current ? (
        <p className="p-8 text-center text-[12px] text-dim">Nothing playing · 何も再生されていません</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative px-5 pb-6">
            {/* the continuous rail line through every node */}
            <div
              aria-hidden
              className="absolute top-3 bottom-3 w-[2px] rounded"
              style={{ left: 37, background: "color-mix(in srgb, var(--ato-border) 85%, transparent)" }}
            />

            {history.length > 0 && (
              <div className="pt-2 pl-9">
                <span className="font-mono text-[9px] tracking-[0.35em] text-dim">PLAYED // 済み</span>
              </div>
            )}
            {history.map((t, i) => (
              <RailRow key={`h-${t.id}-${i}`} track={t} state="played" onJump={() => jumpTo(i)} onRemove={() => removeFromQueue(i)} />
            ))}

            <div ref={currentRef} className="pt-1 pb-1">
              <CurrentRow track={current} />
            </div>

            <div className="pt-2 pl-9">
              <span className="font-mono text-[9px] tracking-[0.35em] text-dim">
                UP NEXT {shuffle ? "// SHUFFLE" : ""}
              </span>
            </div>
            {upcoming.map(({ track: t, queueIndex }, i) => (
              <RailRow
                key={`n-${t.id}-${i}`}
                track={t}
                state="upcoming"
                reorderable={!shuffle}
                dragging={dragFrom === i}
                dropTarget={dragOver === i && dragFrom !== null && dragFrom !== i}
                onDragStart={() => setDragFrom(i)}
                onDragOver={() => setDragOver(i)}
                onDrop={() => dropOn(i)}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
                onJump={() => jumpTo(queueIndex)}
                onRemove={() => removeFromQueue(queueIndex)}
              />
            ))}
            {upcoming.length === 0 && (
              <p className="py-6 pl-9 text-[12px] text-dim">Queue is empty · キューは空です</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function RailRow({
  track,
  state,
  reorderable,
  dragging,
  dropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onJump,
  onRemove,
}: {
  track: TrackMeta;
  state: "played" | "upcoming";
  reorderable?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  onJump: () => void;
  onRemove: () => void;
}) {
  const played = state === "played";
  return (
    <div
      onClick={onJump}
      onKeyDown={(e) => e.key === "Enter" && onJump()}
      role="button"
      tabIndex={0}
      draggable={reorderable}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (!reorderable) return;
        e.preventDefault();
        onDragOver?.();
      }}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className="group relative grid cursor-pointer grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 pr-1 text-left"
      style={{
        height: 52,
        opacity: dragging ? 0.35 : undefined,
        borderTop: dropTarget ? "2px solid var(--ato-accent)" : "2px solid transparent",
      }}
    >
      {/* node */}
      <span className="z-10 flex h-full items-center justify-center">
        {played ? (
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "color-mix(in srgb, var(--ato-text-dim) 55%, transparent)" }}
          />
        ) : (
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full"
            style={{ border: "1.5px solid var(--ato-text-dim)", background: "var(--ato-bg)" }}
          >
            <Disc3 className="h-2.5 w-2.5 text-dim" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={`truncate text-[13px] ${played ? "text-dim" : "font-medium"}`}>{track.title}</span>
        <span className="truncate text-[10px] text-dim">{track.artist}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="font-mono text-[10px] text-dim group-hover:hidden">{formatTime(track.duration)}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${track.title} from queue`}
          className="hidden p-1 text-dim hover:text-accent group-hover:block"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

function CurrentRow({ track }: { track: TrackMeta }) {
  const isPlaying = usePlayback((s) => s.isPlaying);
  return (
    <div className="relative z-10 grid h-16 cursor-default grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 pr-1">
      <span className="flex h-full items-center justify-center">
        <span
          className="h-4.5 w-4.5 rounded-full"
          style={{
            background: "var(--ato-accent)",
            boxShadow: "0 0 0 3px var(--ato-bg), 0 0 0 4.5px var(--ato-accent)",
          }}
        />
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <Play className="h-3 w-3 shrink-0" style={{ color: "var(--ato-accent)", fill: "currentColor" }} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold" style={{ color: "var(--ato-accent)" }}>
            {track.title}
          </span>
          <span className="truncate text-[10px] text-dim">{track.artist}</span>
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className={`eq-glyph ${isPlaying ? "" : "paused"}`} aria-hidden>
          <i /><i /><i />
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--ato-accent)" }}>
          {formatTime(track.duration)}
        </span>
      </span>
    </div>
  );
}

/* ---------------------------------- utils ---------------------------------- */

function useCoverUrl(key: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!key) return;
    loadCoverUrl(key).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return url;
}
