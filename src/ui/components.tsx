import { Check, ChevronLeft, ChevronRight, Disc3, DiscAlbum, Heart, Play, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePlayback } from "@/core/audio/playbackStore";
import { useUi, type AlbumSource } from "@/state/uiStore";
import { useFavorites } from "@/core/cloud/favoritesStore";
import { formatTime, type TrackMeta } from "@/core/library/types";
import { isCatalogueTrack } from "@/core/cloud/cloudService";
import type { AlbumInfo } from "@/core/library/useLibrary";
import { loadCoverUrl } from "@/core/library/coverCache";
import { HoloCover } from "./kit/HoloCover";
import { GradeBadge } from "./kit/GradeBadge";
import { showAlbumMenu, showTrackMenu } from "./menus";

/** CoverThumb: small album-art tile for track rows; gradient + disc fallback. */
export function CoverThumb({ track, className = "" }: { track: TrackMeta; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (track.coverKey) {
      void loadCoverUrl(track.coverKey).then((u) => {
        if (alive && u) setUrl(u);
      });
    }
    return () => {
      alive = false;
    };
  }, [track.coverKey]);

  if (url) {
    return <img src={url} alt="" className={`shrink-0 object-cover ${className}`} draggable={false} />;
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${className}`}
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--ato-accent) 22%, transparent), color-mix(in srgb, var(--ato-accent-2) 18%, transparent))",
      }}
    >
      <Disc3 className="h-1/2 w-1/2 text-dim" strokeWidth={1.5} />
    </span>
  );
}

/**
 * Hidden folder input (webkitdirectory): the universal import fallback for
 * browsers without the File System Access API (Firefox, some webviews).
 * Pass `triggerRef` and call `triggerRef.current?.click()` to open it.
 */
export function DirectoryInput({
  onFiles,
  triggerRef,
}: {
  onFiles: (f: File[]) => void;
  triggerRef?: { current: HTMLInputElement | null };
}) {
  return (
    <input
      ref={(el) => {
        el?.setAttribute("webkitdirectory", "");
        el?.setAttribute("directory", "");
        if (triggerRef) triggerRef.current = el;
      }}
      type="file"
      multiple
      className="hidden"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length) onFiles(files);
        e.target.value = ""; // allow re-picking the same folder
      }}
    />
  );
}

/** Album tile used in Home/Library/Cloud/Catalogue grids. */
export function AlbumCard({ album, source = "local" }: { album: AlbumInfo; source?: AlbumSource }) {
  const navigate = useUi((s) => s.navigate);
  return (
    <button
      onClick={() => navigate("album", album.key, source)}
      onContextMenu={(e) => showAlbumMenu(e, album, source)}
      className="group w-36 shrink-0 text-left md:w-40"
      title={`${album.name} · ${album.artist}`}
    >
      <div className="transition-transform duration-300 ease-out group-hover:-translate-y-1.5">
        <HoloCover
          coverKey={album.coverKey}
          title={album.name}
          grade={album.grade}
          className="h-36 w-36 shadow-lg md:h-40 md:w-40"
        />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <DiscAlbum className="h-3 w-3 shrink-0 text-dim" />
        <span className="truncate text-[13px] font-semibold">{album.name}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-dim">{album.artist}</span>
        <GradeBadge grade={album.grade} />
      </div>
    </button>
  );
}

/**
 * Track list row: click to play in context, right-click for the command menu.
 * Div-rooted so the remove affordance (playlists/queue) can nest inside.
 */
export function TrackRow({
  track,
  index,
  context,
  showAlbum = false,
  onRemove,
  lyricsHit = false,
  selection,
}: {
  track: TrackMeta;
  index: number;
  context: TrackMeta[];
  showAlbum?: boolean;
  onRemove?: (track: TrackMeta) => void;
  /** the active search matched this row through its lyrics */
  lyricsHit?: boolean;
  /** batch-select mode: clicks toggle selection instead of playing */
  selection?: { selected: Set<number>; onToggle: (id: number) => void };
}) {
  const playQueue = usePlayback((s) => s.playQueue);
  const currentId = usePlayback((s) => s.current?.id);
  const isPlaying = usePlayback((s) => s.isPlaying);
  const playing = currentId === track.id;
  const selected = selection?.selected.has(track.id) ?? false;
  const saved = useFavorites((s) => s.keys.includes(track.path));
  const toggleSaved = useFavorites((s) => s.toggle);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => (selection ? selection.onToggle(track.id) : playQueue(context, index))}
      onKeyDown={(e) => {
        if (e.key === "Enter") selection ? selection.onToggle(track.id) : playQueue(context, index);
      }}
      onContextMenu={(e) => showTrackMenu(e, track, context)}
      className="track-row group relative cursor-pointer text-left"
      style={{
        background: selected
          ? "color-mix(in srgb, var(--ato-accent) 18%, transparent)"
          : playing
            ? "color-mix(in srgb, var(--ato-accent) 9%, transparent)"
            : undefined,
        borderBottom: "1px solid var(--ato-border)",
      }}
    >
      <span className="hidden w-6 text-center md:block">
        {selected ? (
          <Check className="mx-auto h-3.5 w-3.5 text-accent" />
        ) : playing ? (
          <span className={`eq-glyph ${isPlaying ? "" : "paused"}`}>
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span className="font-mono text-[11px] text-dim group-hover:hidden">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
        {!playing && !selected && <Play className="hidden h-3.5 w-3.5 text-accent group-hover:block" />}
      </span>
      {/* like sits between the number and the art (its own grid column);
          phones long-press for the menu instead: the column would only
          waste leading width */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleSaved(track.path);
        }}
        className={`hidden shrink-0 text-center transition-opacity md:block ${saved ? "" : "opacity-0 group-hover:opacity-100"}`}
        title={saved ? "Liked" : "Like"}
        aria-label={saved ? `Remove ${track.title} from liked` : `Like ${track.title}`}
      >
        <Heart
          className="h-3.5 w-3.5"
          style={{ color: saved ? "var(--ato-accent)" : undefined }}
          fill={saved ? "var(--ato-accent)" : "none"}
        />
      </button>
      <CoverThumb track={track} className="h-9 w-9" />
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium" style={{ color: playing ? "var(--ato-accent)" : undefined }}>
            {track.title}
          </span>
          {isCatalogueTrack(track) && (
            <span
              className="font-mono shrink-0 text-[7px] font-bold leading-none tracking-[0.15em]"
              style={{ color: "var(--ato-gold)", border: "1px solid color-mix(in srgb, var(--ato-gold) 55%, transparent)", padding: "2px 3px", borderRadius: "3px" }}
              title="From the server's shared catalogue"
            >
              CTL
            </span>
          )}
        </span>
        {/* comma-separated edits split into artists[]: show the full list */}
        <span className="truncate text-[11px] text-dim">
          {track.artists.length > 1 ? track.artists.join(", ") : track.artist}
        </span>
      </span>
      {showAlbum && <span className="hidden truncate text-[11px] text-dim md:block">{track.album}</span>}
      <span className="flex items-center gap-1.5">
        {track.playable === false && (
          <span title={`${track.format.toUpperCase()} codec not supported by this browser`}>
            <TriangleAlert className="h-3.5 w-3.5" style={{ color: "var(--ato-danger)" }} />
          </span>
        )}
        {lyricsHit && (
          <span className="font-jp text-[10px] leading-none" style={{ color: "var(--ato-accent-2)" }} title="Lyrics match">
            歌
          </span>
        )}
        <GradeBadge grade={track.grade} format={track.format} />
      </span>
      {onRemove ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(track);
          }}
          className="p-1 text-dim opacity-100 transition-opacity hover:text-accent md:opacity-0 md:group-hover:opacity-100"
          title="Remove"
          aria-label={`Remove ${track.title}`}
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <span className="font-mono hidden text-right text-[11px] text-dim md:block">{formatTime(track.duration)}</span>
      )}
    </div>
  );
}

/** Horizontal scroll row with gacha-style header. */
export function MediaRow({
  title,
  jp,
  children,
}: {
  title: string;
  jp: string;
  children: React.ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const sync = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  useEffect(() => {
    sync();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const step = (dir: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const scrollable = !atStart || !atEnd;

  return (
    <section className="group/row mb-9">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="font-display text-sm font-bold tracking-[0.25em]">{title}</h2>
        <span className="font-jp text-[10px] tracking-[0.3em] text-dim">{jp}</span>
        <span className="h-px flex-1" style={{ background: "var(--ato-border)" }} />
      </div>
      <div className="relative">
        <div ref={scrollerRef} onScroll={sync} className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
          {children}
        </div>
        {/* Steam-style edge chevrons: hover the row to reveal them. Positioned
            dead-center of the first/last card column (58px = card half 80px -
            button half 22px), fully inside the row: the Director wrapper is a
            scroll container, so any protrusion adds a second horizontal
            scrollbar. top-20 centers on the square art (w-40/2 = 80px). */}
        {scrollable && (
          <>
            <button
              onClick={() => step(-1)}
              aria-label={`Scroll ${title} back`}
              className="pointer-events-none absolute top-20 left-2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full opacity-0 transition-opacity duration-200 group-hover/row:pointer-events-auto group-hover/row:opacity-100"
              style={{
                background: "color-mix(in srgb, var(--ato-panel) 78%, transparent)",
                border: "1px solid var(--ato-border)",
                backdropFilter: "blur(6px)",
              }}
            >
              <ChevronLeft className="h-6 w-6 text-dim transition-colors hover:text-accent" />
            </button>
            <button
              onClick={() => step(1)}
              aria-label={`Scroll ${title} forward`}
              className="pointer-events-none absolute top-20 right-2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full opacity-0 transition-opacity duration-200 group-hover/row:pointer-events-auto group-hover/row:opacity-100"
              style={{
                background: "color-mix(in srgb, var(--ato-panel) 78%, transparent)",
                border: "1px solid var(--ato-border)",
                backdropFilter: "blur(6px)",
              }}
            >
              <ChevronRight className="h-6 w-6 text-dim transition-colors hover:text-accent" />
            </button>
          </>
        )}
      </div>
    </section>
  );
}
