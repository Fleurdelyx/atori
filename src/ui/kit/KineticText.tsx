import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useUi } from "@/state/uiStore";

/**
 * KineticText — per-character staggered entrance.
 * Re-runs whenever `text` changes (titles on track change).
 * Calm mode degrades to a plain fade.
 */
export function KineticText({
  text,
  className,
  style,
  glitch = false,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  glitch?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const calm = useUi((s) => s.calm);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chars = el.querySelectorAll<HTMLSpanElement>(".kt-char");
    if (calm) {
      gsap.fromTo(chars, { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.01 });
      return;
    }
    const ctx = gsap.context(() => {
      if (glitch) {
        gsap.fromTo(
          chars,
          { opacity: 0, xPercent: -18, skewX: 30, filter: "blur(4px)" },
          {
            opacity: 1,
            xPercent: 0,
            skewX: 0,
            filter: "blur(0px)",
            duration: 0.38,
            ease: "power3.out",
            stagger: { each: 0.022, from: "start" },
          },
        );
        gsap.to(chars, {
          keyframes: [
            { x: -2, skewX: -8, duration: 0.05 },
            { x: 2, skewX: 6, duration: 0.05 },
            { x: 0, skewX: 0, duration: 0.05 },
          ],
          delay: 0.42,
          stagger: 0.008,
        });
      } else {
        gsap.fromTo(
          chars,
          { yPercent: 110, opacity: 0, skewX: -14 },
          {
            yPercent: 0,
            opacity: 1,
            skewX: 0,
            duration: 0.55,
            ease: "expo.out",
            stagger: 0.024,
          },
        );
      }
    }, el);
    return () => ctx.revert();
  }, [text, glitch, calm]);

  return (
    <span ref={ref} className={className} style={{ display: "inline-block", ...style }}>
      {[...text].map((c, i) => (
        <span
          key={`${i}-${c}`}
          className="kt-char"
          style={{ display: "inline-block", whiteSpace: "pre", willChange: "transform" }}
        >
          {c}
        </span>
      ))}
    </span>
  );
}
