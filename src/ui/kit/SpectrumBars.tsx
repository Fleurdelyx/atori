import { useEffect, useRef } from "react";
import { audioLevels } from "@/core/audio/AudioLevels";

const BAR_COUNT = 48;

/**
 * SpectrumBars — 48 GPU-friendly bars driven directly by the FFT tap.
 * Writes transforms imperatively in one rAF; zero React re-renders.
 */
export function SpectrumBars({ className = "", height = 56 }: { className?: string; height?: number }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      for (let i = 0; i < BAR_COUNT; i++) {
        const el = refs.current[i];
        if (!el) continue;
        // spread 48 bars over the 32 FFT bands with overlap
        const t = (i / (BAR_COUNT - 1)) * 31;
        const i0 = Math.floor(t);
        const i1 = Math.min(31, i0 + 1);
        const v = audioLevels.bands[i0] * (1 - (t - i0)) + audioLevels.bands[i1] * (t - i0);
        const h = 0.06 + Math.min(1, v * 1.35) * 0.94;
        el.style.transform = `scaleY(${h.toFixed(3)})`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={`flex items-end gap-[3px] ${className}`} style={{ height }} aria-hidden>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="w-[3px] flex-1 origin-bottom"
          style={{
            height: "100%",
            transform: "scaleY(0.06)",
            background:
              i > BAR_COUNT * 0.72 ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-accent-2) 80%, transparent)",
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}
