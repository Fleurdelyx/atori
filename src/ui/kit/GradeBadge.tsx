import type { Grade } from "@/skins/types";

const GRADE_STYLE: Record<Grade, { bg: string; fg: string; label: string }> = {
  SSR: { bg: "var(--ato-gold)", fg: "#1a1205", label: "SSR" },
  SR: { bg: "var(--ato-accent)", fg: "#ffffff", label: "SR" },
  R: { bg: "var(--ato-accent-2)", fg: "#06121a", label: "R" },
  N: { bg: "color-mix(in srgb, var(--ato-text-dim) 30%, transparent)", fg: "var(--ato-text)", label: "N" },
};

/** Rarity-grade chip: shows the file's format (less cryptic than the gacha
 *  letters); the rarity colour still encodes audio quality. */
export function GradeBadge({
  grade,
  format,
  className = "",
}: {
  grade: Grade;
  /** when set, the chip shows the file format (e.g. MP3) instead of the grade */
  format?: string;
  className?: string;
}) {
  const s = GRADE_STYLE[grade];
  const label = format ? format.toUpperCase() : s.label;
  return (
    <span
      className={`font-mono inline-flex h-[18px] items-center justify-center px-1.5 pt-px text-[10px] font-bold leading-none tracking-normal ${className}`}
      style={{
        clipPath: "polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%)",
        background: s.bg,
        color: s.fg,
      }}
      title={
        `${format ? format.toUpperCase() + " · " : ""}` +
        (grade === "SSR"
          ? "Lossless / Hi-Res"
          : grade === "SR"
            ? "320 kbps"
            : grade === "R"
              ? "256 kbps"
              : "Standard")
      }
    >
      {label}
    </span>
  );
}
