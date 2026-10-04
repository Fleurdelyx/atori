import { useEffect, useState } from "react";
import { db } from "@/core/library/db";
import { loadCoverUrl } from "@/core/library/coverCache";

/**
 * PlaylistCover: the user's chosen picture when the playlist has one,
 * otherwise a 2×2 collage from the playlist's first distinct album covers
 * (loaded through the same cache as HoloCover); gradient + initial fallback.
 */
export function PlaylistCover({
  trackIds,
  title,
  pic,
  className = "",
}: {
  trackIds: number[];
  title: string;
  /** user-chosen playlist picture: wins over the collage */
  pic?: Blob;
  className?: string;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const [picUrl, setPicUrl] = useState<string | null>(null);
  const key = trackIds.slice(0, 16).join(",");

  useEffect(() => {
    if (!pic) {
      setPicUrl(null);
      return;
    }
    const url = URL.createObjectURL(pic);
    setPicUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pic]);

  useEffect(() => {
    if (pic) return; // custom picture replaces the collage
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
  }, [key, pic]);

  const initial = title?.trim()?.[0]?.toUpperCase() ?? "♪";

  // fewer than 4 distinct covers: a single full-bleed image reads far better
  // than tiling the same artwork
  if (picUrl || urls.length > 0) {
    const src = picUrl ?? urls[0];
    return (
      <img
        src={src}
        alt={title}
        className={`shrink-0 object-cover ${className}`}
        style={{ borderRadius: "var(--ato-radius)" }}
        draggable={false}
      />
    );
  }

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
