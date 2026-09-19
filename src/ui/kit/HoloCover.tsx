import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Disc3 } from "lucide-react";
import { loadCoverUrl } from "@/core/library/coverCache";
import type { Grade } from "@/skins/types";

/**
 * HoloCover — album art tile with holographic foil sweep (CSS),
 * initial-letter placeholder and optional motion shared-layout id
 * (mini player ↔ Now Playing morph).
 */
export function HoloCover({
  coverKey,
  title,
  grade,
  layoutId,
  className = "",
  rounded = true,
}: {
  coverKey: string | null | undefined;
  title: string;
  grade?: Grade;
  layoutId?: string;
  className?: string;
  rounded?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    void loadCoverUrl(coverKey).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [coverKey]);

  const initial = title?.trim()?.[0]?.toUpperCase() ?? "♪";

  return (
    <motion.div
      layoutId={layoutId}
      className={`foil relative overflow-hidden bg-panel2 ${rounded ? "rounded-ato" : ""} ${className}`}
      style={{ transition: "background 0.6s ease" }}
    >
      {url ? (
        <img src={url} alt={title} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-1"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--ato-accent) 22%, transparent), color-mix(in srgb, var(--ato-accent-2) 18%, transparent))",
          }}
        >
          <Disc3 className="h-1/4 w-1/4 text-dim" strokeWidth={1.5} />
          <span className="font-display text-2xl font-bold text-dim">{initial}</span>
        </div>
      )}
      {grade === "SSR" && (
        <span
          className="font-mono absolute right-1 top-1 px-1 text-[9px] font-bold"
          style={{
            clipPath: "polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)",
            background: "var(--ato-gold)",
            color: "#1a1205",
          }}
        >
          HI-RES
        </span>
      )}
    </motion.div>
  );
}
