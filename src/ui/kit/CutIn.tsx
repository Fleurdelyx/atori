import { useEffect, useRef } from "react";
import gsap from "gsap";
import { usePlayback } from "@/core/audio/playbackStore";
import { fx } from "@/fx/FxDirector";
import { GradeBadge } from "./GradeBadge";
import { useUi } from "@/state/uiStore";

/**
 * CutIn — the track-change banner.
 * A complete panel slides in from the right, announces the track, holds,
 * then exits back to the right. Also pulses the shader stage (wipe + impact).
 */
export function CutIn() {
  const current = usePlayback((s) => s.current);
  const tick = usePlayback((s) => s.trackChangeTick);
  const calm = useUi((s) => s.calm);
  const first = useRef(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!current) return;
    if (first.current) {
      first.current = false;
      return; // no cut-in for a track restored at mount
    }
    fx.wipe(1);
    fx.impact(0.9);

    const panel = panelRef.current;
    const title = titleRef.current;
    if (!panel || !title || calm) return;

    const tl = gsap.timeline();
    tl.set(panel, { display: "flex" })
      .fromTo(
        panel,
        { xPercent: 130, opacity: 1 },
        { xPercent: 0, duration: 0.45, ease: "expo.out" },
      )
      .fromTo(
        title.children,
        { opacity: 0, x: 40 },
        { opacity: 1, x: 0, duration: 0.3, ease: "power3.out", stagger: 0.07 },
        "-=0.15",
      )
      .to(panel, { xPercent: 0, duration: 1.9 }) // hold
      // texts leave one by one (mirrors the staggered entrance)…
      .to(
        title.children,
        { opacity: 0, x: 40, duration: 0.22, ease: "power2.in", stagger: { each: 0.07, from: "end" } },
      )
      // …then the panel returns to the right
      .to(panel, { xPercent: 130, duration: 0.4, ease: "power3.in" }, "-=0.05")
      .set(panel, { display: "none" });
    return () => {
      tl.kill();
      if (panel) gsap.set(panel, { display: "none" });
    };
  }, [tick, current, calm]);

  if (!current) return null;

  return (
    <div
      ref={panelRef}
      className="font-display pointer-events-none fixed top-24 right-0 z-50 hidden"
      style={{ willChange: "transform" }}
    >
      <div
        className="flex items-stretch gap-0 border border-line bg-panel shadow-2xl backdrop-blur-md"
        style={{ borderRadius: "var(--ato-radius)", borderRightWidth: 3, borderRightColor: "var(--ato-accent)" }}
      >
        <div className="w-1.5" style={{ background: "var(--ato-accent)" }} />
        <div className="flex flex-col gap-1 px-6 py-4" ref={titleRef}>
          <div className="font-mono flex items-center gap-3 text-[10px] tracking-[0.3em]">
            <span style={{ color: "var(--ato-accent)" }}>NOW PLAYING</span>
            <span className="text-dim">再生中</span>
            <GradeBadge grade={current.grade} />
          </div>
          <div className="text-xl font-bold">{current.title}</div>
          <div className="text-sm text-dim">
            {current.artist} — {current.album}
          </div>
        </div>
      </div>
    </div>
  );
}
