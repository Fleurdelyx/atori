import { useEffect, useState } from "react";
import { ListMusic } from "lucide-react";
import { loadCoverUrl } from "@/core/library/coverCache";
import type { TrackMeta } from "@/core/library/types";

/**
 * CataloguePlaylistCover: same idea as PlaylistCover, but over catalogue
 * tracks — the user's custom picture when set, else a collage of the first
 * distinct member covers (absolute catalogue/cover/… keys stream through the
 * same cover cache); gradient + initial fallback for an empty playlist.
 */
export function CataloguePlaylistCover({
  tracks,
  title,
  pic,
  picKey,
  className = "",
}: {
  tracks: TrackMeta[];
  title: string;
  pic?: Blob;
  /** custom cover stored in the catalogue namespace (absolute key) */
  picKey?: string | null;
  className?: string;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const [picUrl, setPicUrl] = useState<string | null>(null);
  const key = tracks
    .slice(0, 16)
    .map((t) => t.path)
    .join(",");

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
    if (pic || !picKey) return;
    let alive = true;
    void loadCoverUrl(picKey).then((u) => alive && setPicUrl(u));
    return () => {
      alive = false;
    };
  }, [pic, picKey]);

  useEffect(() => {
    if (pic || picKey) return; // custom picture replaces the collage
    let alive = true;
    void (async () => {
      const covers: string[] = [];
      const seen = new Set<string>();
      for (const t of key ? key.split(",").map((p) => tracks.find((x) => x.path === p)).filter((x): x is TrackMeta => !!x) : []) {
        if (!t.coverKey || seen.has(t.coverKey)) continue;
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
  }, [key, pic, tracks]);

  const initial = title?.trim()?.[0]?.toUpperCase() ?? "♪";

  return (
    <div
      className={`relative shrink-0 overflow-hidden ${className}`}
      style={{
        borderRadius: "var(--ato-radius)",
        background: "linear-gradient(135deg, color-mix(in srgb, var(--ato-gold) 20%, transparent), color-mix(in srgb, var(--ato-accent-2) 16%, transparent))",
        border: "1px solid var(--ato-border)",
      }}
    >
      {picUrl ? (
        <img src={picUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : urls.length >= 4 ? (
        <span className="grid h-full w-full grid-cols-2 grid-rows-2">
          {urls.slice(0, 4).map((u, i) => (
            <img key={i} src={u} alt="" className="h-full w-full object-cover" draggable={false} />
          ))}
        </span>
      ) : urls.length > 0 ? (
        <img src={urls[0]} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          {tracks.length === 0 ? <ListMusic className="h-4 w-4 text-dim" strokeWidth={1.5} /> : <span className="font-display text-sm font-bold text-dim">{initial}</span>}
        </span>
      )}
    </div>
  );
}
