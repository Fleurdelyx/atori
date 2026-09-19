import { Check, DiscAlbum, Heart, Play, TriangleAlert, X } from "lucide-react";
import { usePlayback } from "@/core/audio/playbackStore";
import { useUi } from "@/state/uiStore";
import { useFavorites } from "@/core/cloud/favoritesStore";
import { formatTime, type TrackMeta } from "@/core/library/types";
import type { AlbumInfo } from "@/core/library/useLibrary";
import { HoloCover } from "./kit/HoloCover";
import { GradeBadge } from "./kit/GradeBadge";
import { showAlbumMenu, showTrackMenu } from "./menus";

/**
 * Hidden folder input (webkitdirectory) — the universal import fallback for
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

/** Album tile used in Home/Library/Cloud grids. */
export function AlbumCard({ album, source = "local" }: { album: AlbumInfo; source?: "local" | "cloud" }) {
  const navigate = useUi((s) => s.navigate);
  return (
    <button
      onClick={() => navigate("album", album.key, source)}
      onContextMenu={(e) => showAlbumMenu(e, album, source)}
      className="group w-40 shrink-0 text-left"
      title={`${album.name} — ${album.artist}`}
    >
      <div className="transition-transform duration-300 ease-out group-hover:-translate-y-1.5">
        <HoloCover
          coverKey={album.coverKey}
          title={album.name}
          grade={album.grade}
          className="h-40 w-40 shadow-lg"
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
 * Track list row — click to play in context, right-click for the command menu.
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
      className="group grid h-12 w-full grid-cols-[2rem_minmax(0,1fr)_auto] cursor-pointer items-center gap-3 px-3 text-left md:grid-cols-[2rem_minmax(0,1fr)_minmax(0,10rem)_auto_auto]"
      style={{
        background: selected
          ? "color-mix(in srgb, var(--ato-accent) 18%, transparent)"
          : playing
            ? "color-mix(in srgb, var(--ato-accent) 9%, transparent)"
            : undefined,
        borderBottom: "1px solid var(--ato-border)",
      }}
    >
      <span className="w-6 text-center">
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
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium" style={{ color: playing ? "var(--ato-accent)" : undefined }}>
          {track.title}
        </span>
        <span className="truncate text-[11px] text-dim">{track.artist}</span>
      </span>
      {showAlbum && <span className="hidden truncate text-[11px] text-dim md:block">{track.album}</span>}
      <span className="flex items-center gap-1.5">
        {track.source === "cloud" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleSaved(track.path);
            }}
            className={`p-0.5 transition-opacity ${saved ? "" : "opacity-0 group-hover:opacity-100"}`}
            title={saved ? "Saved" : "Save"}
            aria-label={saved ? `Remove ${track.title} from saved` : `Save ${track.title}`}
          >
            <Heart
              className="h-3.5 w-3.5"
              style={{ color: saved ? "var(--ato-accent)" : undefined }}
              fill={saved ? "var(--ato-accent)" : "none"}
            />
          </button>
        )}
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
        <GradeBadge grade={track.grade} />
      </span>
      {onRemove ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(track);
          }}
          className="p-1 text-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
          title="Remove"
          aria-label={`Remove ${track.title}`}
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <span className="font-mono hidden text-[11px] text-dim md:inline">{formatTime(track.duration)}</span>
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
  return (
    <section className="mb-9">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="font-display text-sm font-bold tracking-[0.25em]">{title}</h2>
        <span className="font-jp text-[10px] tracking-[0.3em] text-dim">{jp}</span>
        <span className="h-px flex-1" style={{ background: "var(--ato-border)" }} />
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">{children}</div>
    </section>
  );
}
