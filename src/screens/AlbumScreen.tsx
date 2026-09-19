import { useMemo } from "react";
import { ArrowLeft, ListPlus, Play, Shuffle } from "lucide-react";
import { useAlbums } from "@/core/library/useLibrary";
import { usePlayback } from "@/core/audio/playbackStore";
import { useUi } from "@/state/uiStore";
import { useCloud } from "@/core/cloud/cloudStore";
import { manifestToTracks } from "@/core/cloud/cloudService";
import { groupAlbums } from "@/core/library/useLibrary";
import { fx } from "@/fx/FxDirector";
import { toast } from "@/state/toastStore";
import { HoloCover } from "@/ui/kit/HoloCover";
import { GradeBadge } from "@/ui/kit/GradeBadge";
import { TrackRow } from "@/ui/components";
import { formatTime } from "@/core/library/types";

export function AlbumScreen() {
  const albumKey = useUi((s) => s.albumKey);
  const albumSource = useUi((s) => s.albumSource);
  const navigate = useUi((s) => s.navigate);
  const playQueue = usePlayback((s) => s.playQueue);
  const addToQueue = usePlayback((s) => s.addToQueue);

  const localAlbums = useAlbums();
  const { manifest } = useCloud();
  const albums = useMemo(() => {
    if (albumSource !== "cloud") return localAlbums;
    return manifest ? groupAlbums(manifestToTracks(manifest)) : [];
  }, [albumSource, localAlbums, manifest]);

  const album = useMemo(() => albums.find((a) => a.key === albumKey), [albums, albumKey]);

  if (!album) {
    return (
      <div className="p-10">
        <button onClick={() => navigate(albumSource === "cloud" ? "cloud" : "library")} className="text-sm text-dim hover:text-accent">
          ← Back
        </button>
      </div>
    );
  }

  const totalSec = album.tracks.reduce((s, t) => s + (t.duration || 0), 0);
  const startIdx = Math.floor(Math.random() * album.tracks.length);

  return (
    <div className="h-full overflow-y-auto">
      {/* hero */}
      <div className="relative">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--ato-accent) 10%, transparent), transparent 70%)",
          }}
        />
        <div className="relative flex flex-col items-center gap-7 px-10 pt-10 md:flex-row">
          <button
            onClick={() => navigate(albumSource === "cloud" ? "cloud" : "library")}
            className="clip-tag font-mono absolute top-5 left-6 px-3 py-1.5 text-[10px] tracking-[0.25em] text-dim hover:text-accent"
          >
            <ArrowLeft className="inline h-3 w-3" /> BACK
          </button>
          <HoloCover
            coverKey={album.coverKey}
            title={album.name}
            grade={album.grade}
            className="h-52 w-52 shadow-2xl"
          />
          <div className="min-w-0">
            <div className="font-mono flex items-center gap-3 text-[10px] tracking-[0.3em] text-dim">
              <span style={{ color: "var(--ato-accent)" }}>ALBUM</span>
              <span>アルバム</span>
              <GradeBadge grade={album.grade} />
            </div>
            <h1 className="font-display mt-2 text-4xl leading-tight font-bold">{album.name}</h1>
            <p className="mt-2 text-sm text-dim">
              {album.artist}
              {album.year ? ` — ${album.year}` : ""} · {album.tracks.length} tracks ·{" "}
              {formatTime(totalSec)}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  fx.impact(1);
                  playQueue(album.tracks, 0);
                }}
                className="clip-slash-both font-display flex items-center gap-2 px-7 py-2.5 text-xs font-bold tracking-[0.25em]"
                style={{
                  background: "var(--ato-accent)",
                  color: "var(--ato-bg)",
                  boxShadow: "0 0 28px color-mix(in srgb, var(--ato-accent) 40%, transparent)",
                }}
              >
                <Play className="h-4 w-4" /> PLAY
              </button>
              <button
                onClick={() => {
                  fx.impact(0.8);
                  playQueue(album.tracks, startIdx);
                }}
                className="clip-slash-both font-display flex items-center gap-2 px-6 py-2.5 text-xs font-bold tracking-[0.25em]"
                style={{
                  background: "color-mix(in srgb, var(--ato-accent-2) 16%, transparent)",
                  color: "var(--ato-accent-2)",
                }}
              >
                <Shuffle className="h-4 w-4" /> SHUFFLE
              </button>
              <button
                onClick={() => {
                  for (const t of album.tracks) addToQueue(t);
                  toast(`Queued ${album.name}`, "info", "キューに追加");
                }}
                className="clip-slash-both font-display flex items-center gap-2 px-6 py-2.5 text-xs font-bold tracking-[0.25em]"
                style={{
                  background: "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                  color: "var(--ato-text-dim)",
                }}
              >
                <ListPlus className="h-4 w-4" /> QUEUE
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* tracklist */}
      <div className="px-6 pt-8 pb-10">
        {album.tracks.map((t, i) => (
          <TrackRow key={t.id} track={t} index={i} context={album.tracks} />
        ))}
      </div>
    </div>
  );
}
