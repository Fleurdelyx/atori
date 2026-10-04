import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Disc3, GripVertical, ListMusic, Trash2, X } from "lucide-react";
import { usePlayback } from "@/core/audio/playbackStore";
import { engine } from "@/core/audio/AudioEngine";
import { useUi } from "@/state/uiStore";
import { useMotion, cssEase } from "@/skins/SkinProvider";
import { toast } from "@/state/toastStore";
import { HoloCover } from "./HoloCover";
import { PhonographQueue } from "./PhonographQueue";
import type { TrackMeta } from "@/core/library/types";

/** queue row entrance: a hard skewed slide (matches the rail's slash cuts),
 *  cascaded down the list */
const rowVariants = (slash: [number, number, number, number]) => ({
  hidden: { opacity: 0, x: 46, skewX: -7 },
  show: (i: number) => ({
    opacity: 1,
    x: 0,
    skewX: 0,
    transition: { delay: Math.min(i, 14) * 0.024, duration: 0.3, ease: slash },
  }),
  exit: { opacity: 0, x: 30, skewX: 4, transition: { duration: 0.14, ease: "easeIn" as const } },
});

/** Slide-over panel showing the current queue and upcoming tracks.
 *  Two layouts: the classic list panel and the phonograph disc+rail view. */
export function QueuePanel() {
  const open = useUi((s) => s.queueOpen);
  const setOpen = useUi((s) => s.setQueueOpen);
  const queueStyle = useUi((s) => s.queueStyle);
  const setQueueStyle = useUi((s) => s.setQueueStyle);
  const current = usePlayback((s) => s.current);
  const queue = usePlayback((s) => s.queue);
  const index = usePlayback((s) => s.index);
  const shuffle = usePlayback((s) => s.shuffle);
  const jumpTo = usePlayback((s) => s.jumpTo);
  const removeFromQueue = usePlayback((s) => s.removeFromQueue);
  const moveInQueue = usePlayback((s) => s.moveInQueue);
  const upNext = usePlayback((s) => s.upNextEntries);
  const motion_ = useMotion();
  const slash = cssEase(motion_.easeSlash);
  const rows = rowVariants(slash);
  // panel-relative drag state (absolute queue index = index + 1 + i)
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const next = upNext();
  const wide = queueStyle === "phonograph";

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
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="queue-veil"
            className="fixed inset-0 z-[60]"
            style={{ background: "color-mix(in srgb, var(--ato-bg) 45%, transparent)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => setOpen(false)}
          />
          <motion.aside
            key={wide ? "queue-phonograph" : "queue-panel"}
            className={`fixed top-0 right-0 bottom-0 z-[61] flex flex-col overflow-hidden bg-panel backdrop-blur-xl @container ${
              wide ? "w-[min(920px,92vw)]" : "w-[380px]"
            }`}
            style={{ borderLeft: "1px solid var(--ato-border)", boxShadow: "-24px 0 60px rgba(0,0,0,.5)" }}
            initial={{ x: wide ? 960 : 400, skewX: -5 }}
            animate={{ x: 0, skewX: 0 }}
            exit={{ x: wide ? 980 : 420, skewX: 3 }}
            transition={{ duration: 0.4, ease: slash }}
          >
            {/* blade sweep down the panel's cutting edge — fires AFTER the
                slide lands (delay ≈ the panel's travel time under the slash
                ease), otherwise it finishes while the panel is still
                off-screen and only the tail flashes in a corner */}
            <motion.div
              className="pointer-events-none absolute inset-y-[-10%] left-0 z-30 w-28"
              initial={{ y: "-130%", opacity: 0, skewX: -12 }}
              animate={{ y: "130%", opacity: [0, 0.6, 0], skewX: -12 }}
              transition={{ delay: 0.28, duration: 0.75, ease: slash, times: [0, 0.3, 1] }}
              style={{
                background:
                  "linear-gradient(180deg, transparent, color-mix(in srgb, var(--ato-accent) 60%, transparent) 38%, color-mix(in srgb, var(--ato-accent-2) 55%, transparent) 66%, transparent)",
              }}
            />
            <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--ato-border)" }}>
              <div className="flex items-baseline gap-3">
                <ListMusic className="h-4 w-4" style={{ color: "var(--ato-accent)" }} />
                <h2 className="font-display text-sm font-bold tracking-[0.3em]">QUEUE</h2>
                <span className="font-jp text-[10px] tracking-[0.3em] text-dim">キュー</span>
                <span className="font-mono text-[10px] text-dim">{queue.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <StyleToggle wide={wide} onPanel={() => setQueueStyle("panel")} onPhonograph={() => setQueueStyle("phonograph")} />
                <button onClick={() => setOpen(false)} className="p-1 text-dim hover:text-accent" aria-label="Close queue">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            {wide ? (
              <PhonographQueue />
            ) : current ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="px-5 pt-4 pb-2">
                  <div className="font-mono text-[9px] tracking-[0.35em]" style={{ color: "var(--ato-accent)" }}>
                    NOW PLAYING
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <HoloCover coverKey={current.coverKey} title={current.title} className="h-11 w-11 shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold">{current.title}</div>
                      <div className="truncate text-[11px] text-dim">{current.artist}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between px-5 pt-4 pb-1">
                  <span className="font-mono text-[9px] tracking-[0.35em] text-dim">
                    UP NEXT {shuffle ? "// SHUFFLE" : ""}
                  </span>
                  {next.length > 0 && (
                    <button
                      onClick={() => {
                        engine.clearUpNext();
                        toast("Queue cleared", "info", "キューを消去");
                      }}
                      className="font-mono flex items-center gap-1 text-[9px] tracking-[0.2em] text-dim hover:text-accent"
                    >
                      <Trash2 className="h-3 w-3" /> CLEAR
                    </button>
                  )}
                </div>
                <div className="pb-6">
                  {next.map(({ track: t, queueIndex }, i) => (
                    <motion.div
                      key={`${t.id}-${i}`}
                      custom={i}
                      variants={rows}
                      initial="hidden"
                      animate="show"
                      exit="exit"
                    >
                      <QueueRow
                        track={t}
                        order={i + 1}
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
                    </motion.div>
                  ))}
                  {next.length === 0 && (
                    <p className="px-5 py-6 text-center text-[12px] text-dim">
                      Queue is empty · キューは空です
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="p-8 text-center text-[12px] text-dim">Nothing playing · 何も再生されていません</p>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function QueueRow({
  track,
  order,
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
  order: number;
  reorderable: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onJump: () => void;
  onRemove: () => void;
}) {
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
        onDragOver();
      }}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className="group grid h-12 cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-5 text-left hover:bg-accent/5"
      style={{
        borderBottom: "1px solid var(--ato-border)",
        opacity: dragging ? 0.35 : undefined,
        borderTop: dropTarget ? "2px solid var(--ato-accent)" : "2px solid transparent",
      }}
    >
      {reorderable ? (
        <>
          <span className="hidden text-center text-dim group-hover:block">
            <GripVertical className="mx-auto h-3.5 w-3.5" />
          </span>
          <span className="font-mono text-center text-[11px] text-dim group-hover:hidden">
            {String(order).padStart(2, "0")}
          </span>
        </>
      ) : (
        <>
          <span />
          <span className="font-mono text-center text-[11px] text-dim">{String(order).padStart(2, "0")}</span>
        </>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium">{track.title}</span>
        <span className="truncate text-[11px] text-dim">{track.artist}</span>
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="p-1 text-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
        aria-label={`Remove ${track.title} from queue`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** header pill that switches to the OTHER queue layout (compact: one pill, not two) */
function StyleToggle({
  wide,
  onPanel,
  onPhonograph,
}: {
  wide: boolean;
  onPanel: () => void;
  onPhonograph: () => void;
}) {
  return (
    <button
      onClick={wide ? onPanel : onPhonograph}
      className="font-mono flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] tracking-[0.22em] text-dim transition-colors hover:text-accent"
      style={{
        border: "1px solid var(--ato-border)",
        background: "transparent",
      }}
      title={wide ? "Switch to the classic list panel" : "Switch to the phonograph view"}
    >
      {wide ? <ListMusic className="h-3 w-3" /> : <Disc3 className="h-3 w-3" />}
      {wide ? "PANEL" : "PHONOGRAPH"}
    </button>
  );
}
