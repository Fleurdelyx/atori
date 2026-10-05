import { useEffect, useMemo, useRef, useState } from "react";
import { Disc3, FolderPlus, ListMusic, Play, Search, User } from "lucide-react";
import { useAlbums, useAllTracks, useArtists, useRecentlyPlayed } from "@/core/library/useLibrary";
import { useUi } from "@/state/uiStore";
import { AlbumCard, DirectoryInput, MediaRow, TrackRow } from "@/ui/components";
import { ScrollFade } from "@/ui/kit/ScrollFade";
import { useImporter } from "@/hooks/useImporter";
import { supportsDirectoryPicker } from "@/core/library/importService";
import { matchTrack } from "@/core/library/search";
import { usePlaylists } from "@/core/library/playlists";
import { useCloudPlaylists } from "@/core/cloud/playlistStore";
import { usePlayback } from "@/core/audio/playbackStore";
import { fx } from "@/fx/FxDirector";
import { HoloCover } from "@/ui/kit/HoloCover";
import type { AlbumInfo } from "@/core/library/useLibrary";

function greeting(): { en: string; jp: string } {
  const h = new Date().getHours();
  if (h < 5) return { en: "Late night listening", jp: "夜ふかし" };
  if (h < 12) return { en: "Good morning", jp: "おはよう" };
  if (h < 18) return { en: "Good afternoon", jp: "こんにちは" };
  return { en: "Good evening", jp: "おかえりなさい" };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-mono px-2 pb-1 pt-2.5 text-[9px] tracking-[0.3em] text-dim">{children}</div>;
}

function SearchRow({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="group flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent/10">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center text-dim group-hover:text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{title}</span>
        <span className="block truncate text-[10px] text-dim">{sub}</span>
      </span>
    </button>
  );
}

/** Home's search field: live grouped results over the whole merged library
 *  (local + personal cloud + the server catalogue), Enter jumps into the
 *  Library with the filter applied. */
function HomeSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const tracks = useAllTracks();
  const albums = useAlbums();
  const artists = useArtists();
  const localPls = usePlaylists();
  const cloudPls = useCloudPlaylists((s) => s.playlists);
  const navigate = useUi((s) => s.navigate);
  const setLibraryFilter = useUi((s) => s.setLibraryFilter);
  const setArtistFocus = useUi((s) => s.setArtistFocus);
  const setPlaylistFocus = useUi((s) => s.setPlaylistFocus);
  const setCloudPlaylistFocus = useUi((s) => s.setCloudPlaylistFocus);
  const setNowPlayingOpen = useUi((s) => s.setNowPlayingOpen);
  const playQueue = usePlayback((s) => s.playQueue);
  const query = q.trim().toLowerCase();

  const hits = useMemo(() => {
    if (!query) return null;
    const t = tracks.filter((x) => matchTrack(x, query).hit).slice(0, 5);
    const a = albums
      .filter((x) => x.name.toLowerCase().includes(query) || x.artist.toLowerCase().includes(query))
      .slice(0, 4);
    const ar = artists.filter((x) => x.name.toLowerCase().includes(query)).slice(0, 4);
    const p = [
      ...localPls.map((pl) => ({ kind: "local" as const, id: pl.id as number, name: pl.name, count: pl.trackIds.length })),
      ...cloudPls.map((pl) => ({ kind: "cloud" as const, id: pl.id, name: pl.name, count: pl.trackKeys.length })),
    ]
      .filter((x) => x.name.toLowerCase().includes(query))
      .slice(0, 4);
    return { t, a, ar, p, total: t.length + a.length + ar.length + p.length };
  }, [query, tracks, albums, artists, localPls, cloudPls]);

  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative w-full sm:w-80">
      <label
        className="clip-tag flex items-center gap-2 bg-panel px-4 py-2"
        style={{ border: "1px solid var(--ato-border)" }}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-dim" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Enter" && q.trim()) {
              go(() => {
                setLibraryFilter(q.trim());
                navigate("library");
              });
            }
          }}
          placeholder="SEARCH ・ 検索…"
          className="font-mono w-full bg-transparent text-[11px] tracking-[0.2em] outline-none placeholder:text-dim"
        />
      </label>
      {open && hits && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div
            className="clip-notch absolute right-0 z-50 mt-2 max-h-[60vh] w-[min(26rem,92vw)] overflow-y-auto bg-panel p-2 backdrop-blur-xl"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 60px rgba(0,0,0,.5)" }}
          >
            {hits.total === 0 && <p className="font-mono px-2 py-3 text-[11px] text-dim">No matches · 該当なし</p>}
            {hits.t.length > 0 && <SectionLabel>TRACKS 曲</SectionLabel>}
            {hits.t.map((t) => (
              <SearchRow
                key={`t-${t.id}`}
                icon={<Play className="h-3.5 w-3.5" />}
                title={t.title}
                sub={t.artist}
                onClick={() =>
                  go(() => {
                    fx.impact(0.8);
                    playQueue(hits.t, hits.t.indexOf(t));
                    setNowPlayingOpen(true);
                  })
                }
              />
            ))}
            {hits.a.length > 0 && <SectionLabel>ALBUMS アルバム</SectionLabel>}
            {hits.a.map((a: AlbumInfo) => (
              <SearchRow
                key={`a-${a.key}`}
                icon={<HoloCover coverKey={a.coverKey} title={a.name} grade={a.grade} className="h-8 w-8" />}
                title={a.name}
                sub={a.artist}
                onClick={() => go(() => navigate("album", a.key, a.tracks[0]?.source ?? "local"))}
              />
            ))}
            {hits.ar.length > 0 && <SectionLabel>ARTISTS アーティスト</SectionLabel>}
            {hits.ar.map((ar) => (
              <SearchRow
                key={`ar-${ar.name}`}
                icon={<User className="h-4 w-4" />}
                title={ar.name}
                sub={`${ar.trackCount} tracks`}
                onClick={() => go(() => { setArtistFocus({ name: ar.name, n: Date.now() }); navigate("library"); })}
              />
            ))}
            {hits.p.length > 0 && <SectionLabel>PLAYLISTS プレイリスト</SectionLabel>}
            {hits.p.map((p) => (
              <SearchRow
                key={`p-${p.kind}-${p.id}`}
                icon={p.kind === "cloud" ? <Disc3 className="h-4 w-4" /> : <ListMusic className="h-4 w-4" />}
                title={p.name}
                sub={`${p.count} tracks${p.kind === "cloud" ? " · CLOUD" : ""}`}
                onClick={() =>
                  go(() => {
                    if (p.kind === "local") setPlaylistFocus({ id: p.id, n: Date.now() });
                    else setCloudPlaylistFocus({ id: p.id, n: Date.now() });
                    navigate("library");
                  })
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyLibrary({ onImport, progress }: { onImport: () => void; progress: { done: number; total: number; current: string } | null }) {
  return (
    <div className="mx-auto mt-10 max-w-2xl">
      <div
        className="clip-notch relative border border-dashed bg-panel px-5 py-10 text-center backdrop-blur-md md:px-10 md:py-16"
        style={{ borderColor: "color-mix(in srgb, var(--ato-accent) 45%, transparent)" }}
      >
        <FolderPlus className="mx-auto h-12 w-12" style={{ color: "var(--ato-accent)" }} strokeWidth={1.4} />
        <h2 className="font-display mt-5 text-2xl font-bold tracking-wide">Your library is empty</h2>
        <p className="font-jp mt-1 text-sm text-dim">ライブラリは空です</p>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-dim">
          Point Atori at a music folder: MP3, FLAC, WAV, OGG, OPUS, M4A. Tags, cover art and
          hi-res grades are read locally; nothing leaves your machine.
        </p>
        <button
          onClick={() => {
            fx.impact(0.8);
            onImport();
          }}
          className="clip-slash-both font-display mt-8 px-8 py-3 text-sm font-bold tracking-[0.25em]"
          style={{
            background: "var(--ato-accent)",
            color: "var(--ato-bg)",
            boxShadow: "0 0 32px color-mix(in srgb, var(--ato-accent) 40%, transparent)",
          }}
        >
          IMPORT MUSIC FOLDER
        </button>
        <p className="font-mono mt-4 text-[10px] tracking-[0.2em] text-dim">
          …OR DROP FILES / FOLDERS ANYWHERE
        </p>

        {progress && (
          <div className="mt-8 text-left">
            <div className="font-mono mb-2 flex justify-between text-[10px] text-dim">
              <span className="truncate">{progress.current}</span>
              <span>
                {progress.done}/{progress.total}
              </span>
            </div>
            <div className="h-1.5 w-full bg-line">
              <div
                className="h-full transition-[width] duration-200"
                style={{
                  width: progress.total ? `${(progress.done / progress.total) * 100}%` : "4px",
                  background: "linear-gradient(90deg, var(--ato-accent), var(--ato-accent-2))",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function HomeScreen() {
  const albums = useAlbums();
  const tracks = useAllTracks();
  const displayName = useUi((s) => s.displayName);
  const { progress, importDir, importList } = useImporter();
  const dirRef = useRef<HTMLInputElement>(null);
  const g = greeting();

  // IMPORT button: native folder picker where available, universal input elsewhere
  const onImportClick = () => {
    fx.impact(0.8);
    if (supportsDirectoryPicker()) void importDir();
    else dirRef.current?.click();
  };

  const recent = useMemo(() => albums.slice(0, 12), [albums]);
  const hires = useMemo(() => albums.filter((a) => a.grade === "SSR").slice(0, 12), [albums]);
  const recentPlays = useRecentlyPlayed(12);
  const mostPlayed = useMemo(
    () => [...tracks].filter((t) => t.playCount > 0).sort((a, b) => b.playCount - a.playCount).slice(0, 8),
    [tracks],
  );
  const dateLine = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [],
  );

  return (
    <ScrollFade className="h-full overflow-y-auto px-5 py-5 md:px-8 md:py-7">
      {/* header */}
      <header className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] tracking-[0.35em] text-dim">{dateLine.toUpperCase()}</div>
            <h1 className="font-display mt-1 text-2xl font-bold md:text-3xl">
              {displayName.trim()
                ? <>{g.en}, {displayName.trim()}. <span style={{ color: "var(--ato-accent)" }}>{g.jp}</span></>
                : <>{g.en}、<span style={{ color: "var(--ato-accent)" }}>{g.jp}</span></>}
            </h1>
          </div>
          <HomeSearch />
        </div>
      </header>

        {albums.length === 0 ? (
          <>
            <EmptyLibrary onImport={onImportClick} progress={progress} />
            <DirectoryInput onFiles={(f) => void importList(f)} triggerRef={dirRef} />
          </>
      ) : (
        <>
          {recentPlays.length > 0 && (
            <MediaRow title="RECENTLY PLAYED" jp="履歴">
              <div className="w-full">
                {recentPlays.map((p, i) => (
                  <TrackRow
                    key={`${p.track.id}-${p.at}`}
                    track={p.track}
                    index={i}
                    context={recentPlays.map((x) => x.track)}
                    showAlbum
                  />
                ))}
              </div>
            </MediaRow>
          )}
          <MediaRow title="RECENTLY ADDED" jp="新着">{recent.map((a) => <AlbumCard key={a.key} album={a} />)}</MediaRow>
          {hires.length > 0 && (
            <MediaRow title="HI-RES COLLECTION" jp="ハイレゾ">
              {hires.map((a) => <AlbumCard key={a.key} album={a} />)}
            </MediaRow>
          )}
          {mostPlayed.length > 0 && (
            <MediaRow title="MOST PLAYED" jp="よく聴く">
              <div className="w-full">
                {mostPlayed.map((t, i) => (
                  <TrackRow key={t.id} track={t} index={i} context={mostPlayed} showAlbum />
                ))}
              </div>
            </MediaRow>
          )}
        </>
      )}
    </ScrollFade>
  );
}
