import { useEffect, useState } from "react";
import { db } from "@/core/library/db";
import { loadCoverUrl } from "@/core/library/coverCache";

/**
 * PlaylistCover — 2×2 collage from the playlist's first distinct album covers
 * (loaded through the same cache as HoloCover); gradient + initial fallback.
 */
export function PlaylistCover({
  trackIds,
  title,
  className = "",
}: {
  trackIds: number[];
  title: string;
  className?: string;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const key = trackIds.slice(0, 16).join(",");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const covers: string[] = [];
      const seen = new Set<string>();
      for (const id of key ? key.split(",").map(Number) : []) {
        const t = await db.tracks.get(id);
        if (!t?.coverKey || seen.has(t.coverKey)) continue;
        seen.add(t.coverKey);
        const url = await loadCoverUrl(t.coverKey);
        if (url) covers.push(url);
        if (covers.length >= 4) break;
      }
      if (alive) setUrls(covers);
    })();
    return () => {
      alive = false;
    };
  }, [key]);

  const initial = title?.trim()?.[0]?.toUpperCase() ?? "♪";

  if (urls.length === 0) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center ${className}`}
        style={{
          borderRadius: "var(--ato-radius)",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--ato-accent) 22%, transparent), color-mix(in srgb, var(--ato-accent-2) 18%, transparent))",
        }}
      >
        <span className="font-display text-sm font-bold text-dim">{initial}</span>
      </div>
    );
  }

  return (
    <div
      className={`grid shrink-0 grid-cols-2 overflow-hidden ${className}`}
      style={{ borderRadius: "var(--ato-radius)" }}
    >
      {(urls.length < 4 ? [urls[0], urls[0], urls[urls.length - 1], urls[urls.length - 1]] : urls).slice(0, 4).map((u, i) => (
        <img key={i} src={u} alt="" className="h-full w-full object-cover" draggable={false} />
      ))}
    </div>
  );
}
