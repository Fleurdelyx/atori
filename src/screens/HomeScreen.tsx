import { useMemo, useRef } from "react";
import { FolderPlus, HardDriveDownload, Sparkles } from "lucide-react";
import { useAlbums, useAllTracks, useRecentlyPlayed } from "@/core/library/useLibrary";
import { useUi } from "@/state/uiStore";
import { AlbumCard, DirectoryInput, MediaRow, TrackRow } from "@/ui/components";
import { useImporter } from "@/hooks/useImporter";
import { supportsDirectoryPicker } from "@/core/library/importService";
import { fx } from "@/fx/FxDirector";

function greeting(): { en: string; jp: string } {
  const h = new Date().getHours();
  if (h < 5) return { en: "Late night listening", jp: "夜ふかし" };
  if (h < 12) return { en: "Good morning", jp: "おはよう" };
  if (h < 18) return { en: "Good afternoon", jp: "こんにちは" };
  return { en: "Good evening", jp: "おかえりなさい" };
}

function EmptyLibrary({ onImport, progress }: { onImport: () => void; progress: { done: number; total: number; current: string } | null }) {
  return (
    <div className="mx-auto mt-10 max-w-2xl">
      <div
        className="clip-notch relative border border-dashed bg-panel px-10 py-16 text-center backdrop-blur-md"
        style={{ borderColor: "color-mix(in srgb, var(--ato-accent) 45%, transparent)" }}
      >
        <FolderPlus className="mx-auto h-12 w-12" style={{ color: "var(--ato-accent)" }} strokeWidth={1.4} />
        <h2 className="font-display mt-5 text-2xl font-bold tracking-wide">Your library is empty</h2>
        <p className="font-jp mt-1 text-sm text-dim">ライブラリは空です</p>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-dim">
          Point Atori at a music folder — MP3, FLAC, WAV, OGG, OPUS, M4A. Tags, cover art and
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
    <div className="h-full overflow-y-auto px-8 py-7">
      {/* header */}
      <header className="mb-8">
        <div className="font-mono text-[10px] tracking-[0.35em] text-dim">{dateLine.toUpperCase()}</div>
        <h1 className="font-display mt-1 text-3xl font-bold">
          {displayName.trim()
            ? <>{g.en}, {displayName.trim()}. <span style={{ color: "var(--ato-accent)" }}>{g.jp}</span></>
            : <>{g.en}、<span style={{ color: "var(--ato-accent)" }}>{g.jp}</span></>}
        </h1>
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
          {albums.length > 0 && (
            <div
              className="clip-slash-both font-mono flex w-fit items-center gap-2 px-4 py-2 text-[10px] tracking-[0.25em] text-dim"
              style={{ background: "color-mix(in srgb, var(--ato-accent-2) 8%, transparent)" }}
            >
              <Sparkles className="h-3 w-3" style={{ color: "var(--ato-gold)" }} />
              {tracks.length} TRACKS // {albums.length} ALBUMS — DROP MORE FILES ANYTIME
              <HardDriveDownload className="h-3 w-3" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
