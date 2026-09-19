import type { Grade } from "@/skins/types";

const GRADE_STYLE: Record<Grade, { bg: string; fg: string; label: string }> = {
  SSR: { bg: "var(--ato-gold)", fg: "#1a1205", label: "SSR" },
  SR: { bg: "var(--ato-accent)", fg: "#ffffff", label: "SR" },
  R: { bg: "var(--ato-accent-2)", fg: "#06121a", label: "R" },
  N: { bg: "color-mix(in srgb, var(--ato-text-dim) 30%, transparent)", fg: "var(--ato-text)", label: "N" },
};

/** Rarity-grade chip — audio quality as gacha rarity (SSR = lossless/hi-res). */
export function GradeBadge({ grade, className = "" }: { grade: Grade; className?: string }) {
  const s = GRADE_STYLE[grade];
  return (
    <span
      className={`font-mono inline-block px-1.5 py-px text-[10px] font-bold leading-relaxed ${className}`}
      style={{
        clipPath: "polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%)",
        background: s.bg,
        color: s.fg,
      }}
      title={
        grade === "SSR"
          ? "Lossless / Hi-Res"
          : grade === "SR"
            ? "320 kbps"
            : grade === "R"
              ? "256 kbps"
              : "Standard"
      }
    >
      {s.label}
    </span>
  );
}
