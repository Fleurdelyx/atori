import { useEffect, useMemo, useRef } from "react";
import { parseLrc } from "@/core/library/lrc";
import { engine } from "@/core/audio/AudioEngine";
import { useUi } from "@/state/uiStore";

/**
 * LyricsSheet — karaoke-style synced lyrics when the track carries LRC
 * timestamps; a static sheet otherwise. Active-line tracking is done
 * imperatively in one rAF (no React re-renders while playing).
 */
export function LyricsSheet({ raw }: { raw: string }) {
  const lines = useMemo(() => parseLrc(raw), [raw]);
  const calm = useUi((s) => s.calm);
  const lrcOffset = useUi((s) => s.lrcOffset);
  const setLrcOffset = useUi((s) => s.setLrcOffset);
  const boxRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeRef = useRef(-1);

  const timed = lines !== null;

  useEffect(() => {
    if (!timed || calm) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const arr = lines!;
      const t = engine.el.currentTime + 0.15 + lrcOffset / 1000; // slight lead + user nudge
      let idx = -1;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].time <= t) idx = i;
        else break;
      }
      if (idx === activeRef.current) return;
      const prev = activeRef.current;
      activeRef.current = idx;
      if (prev >= 0) lineRefs.current[prev]?.classList.remove("lrc-active");
      if (idx >= 0) {
        const el = lineRefs.current[idx];
        if (el) {
          el.classList.add("lrc-active");
          const box = boxRef.current;
          if (box) {
            const target = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
            box.scrollTop += (target - box.scrollTop) * 0.2;
          }
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [lines, timed, calm, lrcOffset]);

  if (lines === null) {
    return (
      <div ref={boxRef} className="max-h-40 overflow-y-auto pr-2 text-sm leading-relaxed whitespace-pre-wrap text-dim">
        {raw}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-[8px] tracking-[0.25em] text-dim">SYNC</span>
        <button
          onClick={() => setLrcOffset(lrcOffset - 500)}
          className="font-mono text-[10px] text-dim hover:text-accent"
          title="lines were late — show them sooner"
        >
          −0.5s
        </button>
        <span
          className="font-mono text-[9px]"
          style={{ color: lrcOffset === 0 ? "var(--ato-text-dim)" : "var(--ato-accent-2)" }}
        >
          {lrcOffset > 0 ? `+${(lrcOffset / 1000).toFixed(1)}` : lrcOffset === 0 ? "0.0" : (lrcOffset / 1000).toFixed(1)}s
        </span>
        <button
          onClick={() => setLrcOffset(lrcOffset + 500)}
          className="font-mono text-[10px] text-dim hover:text-accent"
          title="lines were early — show them later"
        >
          +0.5s
        </button>
        {lrcOffset !== 0 && (
          <button onClick={() => setLrcOffset(0)} className="font-mono text-[8px] tracking-[0.2em] text-dim hover:text-accent">
            RESET
          </button>
        )}
      </div>
      <div ref={boxRef} className="max-h-40 overflow-y-auto pr-2" style={{ scrollBehavior: calm ? "auto" : "smooth" }}>
        {lines.map((l, i) => (
          <div
            key={i}
            ref={(el) => {
              lineRefs.current[i] = el;
            }}
            className="lrc-line py-0.5 text-sm leading-relaxed text-dim"
            style={{ transition: "color .3s, opacity .3s" }}
          >
            {l.text || "♪"}
          </div>
        ))}
      </div>
    </div>
  );
}
