import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ListMusic, Play, Plus, RefreshCw, Search, Share2, Shuffle, Trash2, X, Zap } from "lucide-react";
import { useAlbums, useAllTracks, useArtists, useDexie, useTagStats, trackHasTag, splitGenres, type ArtistInfo } from "@/core/library/useLibrary";
import { db } from "@/core/library/db";
import {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  getCachedPlaylists,
  removeFromPlaylist,
  renamePlaylist,
  usePlaylists,
} from "@/core/library/playlists";
import { createSmartPlaylist, deleteSmartPlaylist, matchSmartPlaylist, useSmartPlaylists } from "@/core/library/smartPlaylists";
import { useCloud } from "@/core/cloud/cloudStore";
import { manifestToTracks } from "@/core/cloud/cloudService";
import { useCloudPlaylists } from "@/core/cloud/playlistStore";
import { AlbumCard, DirectoryInput, TrackRow } from "@/ui/components";
import { VirtualTrackList } from "@/ui/kit/VirtualTrackList";
import { AddUrlPanel } from "@/ui/kit/AddUrlPanel";
import { PlaylistCover } from "@/ui/kit/PlaylistCover";
import { supportsDirectoryPicker } from "@/core/library/importService";
import { matchTrack } from "@/core/library/search";
import { showTagMenu } from "@/ui/menus";
import { showContextMenu } from "@/state/contextMenuStore";
import { isCached, createShare } from "@/core/cloud/cloudService";
import { useImporter } from "@/hooks/useImporter";
import { usePlayback } from "@/core/audio/playbackStore";
import { fx } from "@/fx/FxDirector";
import { toast } from "@/state/toastStore";
import type { Playlist } from "@/core/library/db";
import type { TrackMeta } from "@/core/library/types";

type Tab = "albums" | "artists" | "tracks" | "playlists";
type Scope = "all" | "local" | "cloud" | "offline";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "local", label: "LOCAL" },
  { id: "cloud", label: "CLOUD" },
  { id: "offline", label: "OFFLINE" },
];

const TABS: { id: Tab; label: string; jp: string }[] = [
  { id: "albums", label: "ALBUMS", jp: "アルバム" },
  { id: "artists", label: "ARTISTS", jp: "アーティスト" },
  { id: "tracks", label: "TRACKS", jp: "トラック" },
  { id: "playlists", label: "PLAYLISTS", jp: "プレイリスト" },
];

/** Max chips that ever populate the popular-tags row, regardless of vocabulary size. */
const POPULAR_TAG_LIMIT = 12;

type AlbumSort = "recent" | "title" | "year";
const ALBUM_SORTS: { id: AlbumSort; label: string }[] = [
  { id: "recent", label: "RECENT" },
  { id: "title", label: "TITLE" },
  { id: "year", label: "YEAR" },
];

export function LibraryScreen() {
  const [tab, setTab] = useState<Tab>("albums");
  const [filter, setFilter] = useState("");
  const [selectedArtist, setSelectedArtist] = useState<ArtistInfo | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [albumSort, setAlbumSort] = useState<AlbumSort>("recent");
  const [scope, setScope] = useState<Scope>("all");
  const [cachedPaths, setCachedPaths] = useState<Set<string>>(new Set());
  const albums = useAlbums();
  const tracks = useAllTracks();
  const artists = useArtists();
  const tagStats = useTagStats();
  const { importDir, importList, rescan } = useImporter();
  const dirRef = useRef<HTMLInputElement>(null);
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  const [batchTagValue, setBatchTagValue] = useState("");

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // IMPORT button: native folder picker where available, universal input elsewhere
  const onImportClick = () => {
    if (supportsDirectoryPicker()) void importDir();
    else dirRef.current?.click();
  };

  const q = filter.trim().toLowerCase();
  // OFFLINE needs to know which cloud tracks are already in the Cache API
  useEffect(() => {
    if (scope !== "offline") return;
    let alive = true;
    void (async () => {
      const set = new Set<string>();
      for (const t of tracks) {
        if (t.source !== "cloud") continue;
        if (await isCached(t.path)) set.add(t.path);
      }
      if (alive) setCachedPaths(set);
    })();
    return () => {
      alive = false;
    };
  }, [scope, tracks]);
  const matchesScope = (t: TrackMeta) => {
    const cloud = t.source === "cloud";
    if (scope === "local") return !cloud;
    if (scope === "cloud") return cloud;
    if (scope === "offline") return cloud && cachedPaths.has(t.path);
    return true;
  };
  const filteredAlbums = useMemo(
    () =>
      albums.filter((a) => {
        if (q && !(a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q))) return false;
        if (selectedArtist && !selectedArtist.albumKeys.includes(a.key)) return false;
        if (selectedTag && !a.tracks.some((t) => trackHasTag(t, selectedTag))) return false;
        if (scope !== "all" && !a.tracks.some(matchesScope)) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [albums, q, selectedArtist, selectedTag, scope, cachedPaths],
  );
  const { filteredTracks, lyricsHits } = useMemo(() => {
    if (!q && !selectedTag && scope === "all")
      return { filteredTracks: tracks, lyricsHits: undefined as Set<number> | undefined };
    const hits = new Set<number>();
    const list = tracks.filter((t) => {
      if (selectedTag && !trackHasTag(t, selectedTag)) return false;
      if (scope !== "all" && !matchesScope(t)) return false;
      const m = matchTrack(t, q);
      if (m.byLyrics) hits.add(t.id);
      return m.hit;
    });
    return { filteredTracks: list, lyricsHits: hits.size > 0 ? hits : undefined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, q, selectedTag, scope, cachedPaths]);
  // artists matching the active tag — same name rule as groupArtists
  const shownArtists = useMemo(() => {
    if (!selectedTag) return artists;
    const names = new Set<string>();
    for (const t of tracks) {
      if (!trackHasTag(t, selectedTag)) continue;
      for (const n of t.artists.length ? t.artists : [t.artist]) names.add(n);
    }
    return artists.filter((a) => names.has(a.name));
  }, [artists, tracks, selectedTag]);
  const noMatch = q ? `No matches for “${filter}”.` : "No matches for this tag.";
  const sortedAlbums = useMemo(() => {
    const list = [...filteredAlbums];
    if (albumSort === "title") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (albumSort === "year") list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return list;
  }, [filteredAlbums, albumSort]);

  return (
    <div className="flex h-full flex-col px-8 py-7">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold tracking-wide">
          LIBRARY <span className="font-jp text-lg text-dim">ライブラリ</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onImportClick}
            className="clip-tag flex items-center gap-2 px-4 py-2"
            style={{
              background: "color-mix(in srgb, var(--ato-accent) 14%, transparent)",
              color: "var(--ato-accent)",
            }}
            title="Import a music folder"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="font-mono text-[11px] font-bold tracking-[0.2em]">IMPORT</span>
          </button>
          <button
            onClick={() => setAddUrlOpen(true)}
            className="clip-tag flex items-center gap-2 px-4 py-2"
            style={{
              background: "color-mix(in srgb, var(--ato-accent) 14%, transparent)",
              color: "var(--ato-accent)",
            }}
            title="Add a track from a URL (yt-dlp companion)"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="font-mono text-[11px] font-bold tracking-[0.2em]">ADD URL</span>
          </button>
          <button
            onClick={() => void rescan()}
            className="clip-tag flex items-center gap-2 px-4 py-2"
            style={{
              background: "color-mix(in srgb, var(--ato-accent-2) 14%, transparent)",
              color: "var(--ato-accent-2)",
            }}
            title="Re-scan saved library folders for new/changed files"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="font-mono text-[11px] font-bold tracking-[0.2em]">RESCAN</span>
          </button>
          <DirectoryInput onFiles={(f) => void importList(f)} triggerRef={dirRef} />
          <label
            className="clip-tag flex items-center gap-2 bg-panel px-4 py-2"
            style={{ border: "1px solid var(--ato-border)" }}
          >
            <Search className="h-3.5 w-3.5 text-dim" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="FILTER…"
              className="font-mono w-44 bg-transparent text-[11px] tracking-[0.2em] outline-none placeholder:text-dim"
            />
          </label>
        </div>
      </header>

      {/* tabs */}
      <div className="mb-5 flex shrink-0 flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setSelectedArtist(null);
              setSelectMode(false);
              setSelectedIds(new Set());
              setBatchTagOpen(false);
            }}
            className="clip-tag px-4 py-2"
            style={{
              background:
                tab === t.id ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
              color: tab === t.id ? "var(--ato-bg)" : "var(--ato-text-dim)",
            }}
          >
            <span className="font-display text-[11px] font-bold tracking-[0.25em]">{t.label}</span>
            <span className="font-jp ml-2 text-[9px] opacity-70">{t.jp}</span>
          </button>
        ))}
      </div>

      {/* library scope — all / local / cloud / offline-cached */}
      {tab !== "playlists" && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] tracking-[0.3em] text-dim">SCOPE 種別</span>
          {SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className="clip-tag px-3 py-1 transition-colors"
              style={{
                background: scope === s.id ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                color: scope === s.id ? "var(--ato-bg)" : "var(--ato-text-dim)",
              }}
            >
              <span className="font-mono text-[9px] font-bold tracking-[0.2em]">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* popular tags — capped at POPULAR_TAG_LIMIT chips; right-click pins one as a playlist */}
      {tagStats.length > 0 && tab !== "playlists" && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] tracking-[0.3em] text-dim">TAGS タグ</span>
          {tagStats.slice(0, POPULAR_TAG_LIMIT).map((s) => {
            const active = selectedTag === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSelectedTag(active ? null : s.key)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  showTagMenu(e, s, tracks);
                }}
                className="clip-tag px-3 py-1.5 transition-colors"
                style={{
                  background: active
                    ? "var(--ato-accent)"
                    : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                  color: active ? "var(--ato-bg)" : "var(--ato-text-dim)",
                }}
                title={`${s.count} tracks — right-click to pin as playlist`}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.2em]">{s.label.toUpperCase()}</span>
                <span className="font-mono ml-2 text-[9px] opacity-60">{s.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {albums.length === 0 && tab !== "playlists" ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="py-16 text-center">
            <ListMusic className="mx-auto h-10 w-10 text-dim" strokeWidth={1.4} />
            <p className="mt-4 text-sm text-dim">
              Nothing here yet —{" "}
              <button className="underline hover:text-accent" onClick={() => void importDir()}>
                import a folder
              </button>{" "}
              or drop files anywhere.
            </p>
          </div>
        </div>
      ) : tab === "albums" ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="font-mono text-[9px] tracking-[0.3em] text-dim">SORT 並び</span>
            {ALBUM_SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setAlbumSort(s.id)}
                className="clip-tag px-3 py-1 transition-colors"
                style={{
                  background:
                    albumSort === s.id ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                  color: albumSort === s.id ? "var(--ato-bg)" : "var(--ato-text-dim)",
                }}
              >
                <span className="font-mono text-[9px] font-bold tracking-[0.2em]">{s.label}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-5">
            {sortedAlbums.map((a) => (
              <AlbumCard key={a.key} album={a} />
            ))}
            {sortedAlbums.length === 0 && <p className="text-sm text-dim">{noMatch}</p>}
          </div>
        </div>
      ) : tab === "artists" ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          <ArtistPane artists={shownArtists} selected={selectedArtist} onSelect={setSelectedArtist} />
        </div>
      ) : tab === "tracks" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* batch select bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setSelectMode(!selectMode);
                setSelectedIds(new Set());
                setBatchTagOpen(false);
              }}
              className="clip-tag px-3 py-1 transition-colors"
              style={{
                background: selectMode ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                color: selectMode ? "var(--ato-bg)" : "var(--ato-text-dim)",
              }}
            >
              <span className="font-mono text-[9px] font-bold tracking-[0.2em]">
                {selectMode ? "SELECTING" : "SELECT"}
              </span>
            </button>
            {selectMode && (
              <>
                <span className="font-mono text-[9px] tracking-[0.2em] text-dim">
                  {selectedIds.size} SELECTED — CLICK ROWS TO TOGGLE
                </span>
                <button
                  disabled={selectedIds.size === 0}
                  onClick={() => setBatchTagOpen(!batchTagOpen)}
                  className="clip-tag px-3 py-1 transition-colors disabled:opacity-40"
                  style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)", color: "var(--ato-text-dim)" }}
                >
                  <span className="font-mono text-[9px] font-bold tracking-[0.2em]">SET TAGS</span>
                </button>
                <button
                  disabled={selectedIds.size === 0}
                  onClick={(e) => {
                    const picked = filteredTracks.filter((t) => selectedIds.has(t.id));
                    if (picked.some((t) => t.source === "cloud")) {
                      toast("Cloud tracks go to cloud playlists — pick local tracks only", "error", "混在できません");
                      return;
                    }
                    const items = [
                      ...getCachedPlaylists().map((pl) => ({
                        label: `＋ ${pl.name}`,
                        jp: "追加",
                        run: () => {
                          void addToPlaylist(pl.id!, [...selectedIds]).then(() =>
                            toast(`Added ${selectedIds.size} tracks`, "success", "プレイリストに追加"),
                          );
                        },
                      })),
                      {
                        label: "＋ New playlist",
                        jp: "新規",
                        run: () => {
                          void createPlaylist("New Playlist").then((id) =>
                            addToPlaylist(id, [...selectedIds]).then(() =>
                              toast("Playlist created", "success", "プレイリストを作成"),
                            ),
                          );
                        },
                      },
                    ];
                    showContextMenu(e, items);
                  }}
                  className="clip-tag px-3 py-1 transition-colors disabled:opacity-40"
                  style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)", color: "var(--ato-text-dim)" }}
                >
                  <span className="font-mono text-[9px] font-bold tracking-[0.2em]">ADD TO PLAYLIST</span>
                </button>
                {batchTagOpen && (
                  <>
                    <input
                      value={batchTagValue}
                      onChange={(e) => setBatchTagValue(e.target.value)}
                      placeholder="Rock, Pop…"
                      className="font-mono w-40 bg-transparent px-2 py-1 text-[11px] outline-none"
                      style={{ border: "1px solid var(--ato-border)" }}
                    />
                    <button
                      disabled={!batchTagValue.trim()}
                      onClick={() => {
                        void (async () => {
                          const newTags = splitGenres(batchTagValue.split(","));
                          for (const id of selectedIds) {
                            const t = tracks.find((x) => x.id === id);
                            if (!t) continue;
                            const merged = [...new Set([...t.genre, ...newTags])];
                            await db.tracks.update(id, { genre: merged });
                          }
                          toast(`Tags updated on ${selectedIds.size} tracks`, "success", "タグ一括編集");
                          setBatchTagValue("");
                          setBatchTagOpen(false);
                        })();
                      }}
                      className="clip-tag px-3 py-1"
                      style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
                    >
                      <span className="font-mono text-[9px] font-bold tracking-[0.2em]">MERGE</span>
                    </button>
                    <button
                      disabled={!batchTagValue.trim()}
                      onClick={() => {
                        void (async () => {
                          const newTags = splitGenres(batchTagValue.split(","));
                          for (const id of selectedIds) await db.tracks.update(id, { genre: newTags });
                          toast(`Tags replaced on ${selectedIds.size} tracks`, "success", "タグ一括編集");
                          setBatchTagValue("");
                          setBatchTagOpen(false);
                        })();
                      }}
                      className="clip-tag px-3 py-1"
                      style={{ background: "color-mix(in srgb, var(--ato-text) 10%, transparent)", color: "var(--ato-text)" }}
                    >
                      <span className="font-mono text-[9px] font-bold tracking-[0.2em]">REPLACE</span>
                    </button>
                  </>
                )}
                </>
              )}
          </div>
          {filteredTracks.length > 0 ? (
            <VirtualTrackList
              tracks={filteredTracks}
              showAlbum
              lyricsHits={lyricsHits}
              className="min-h-0 flex-1"
              selection={selectMode ? { selected: selectedIds, onToggle: toggleSelect } : undefined}
            />
          ) : (
            <p className="py-10 text-center text-sm text-dim">{noMatch}</p>
          )}
        </div>
      ) : (
        <PlaylistsPane />
      )}

      <AddUrlPanel open={addUrlOpen} onClose={() => setAddUrlOpen(false)} />
    </div>
  );
}

function ArtistPane({
  artists,
  selected,
  onSelect,
}: {
  artists: ArtistInfo[];
  selected: ArtistInfo | null;
  onSelect: (a: ArtistInfo | null) => void;
}) {
  const albums = useAlbums();
  const allTracks = useAllTracks();
  const [sort, setSort] = useState<"count" | "name">("count");
  const shown = selected ? albums.filter((a) => selected.albumKeys.includes(a.key)) : [];
  // artist page: their most-played tracks, Spotify-style
  const topTracks = useMemo(() => {
    if (!selected) return [];
    return allTracks
      .filter(
        (t) =>
          t.artist === selected.name ||
          t.albumArtist === selected.name ||
          t.artists.includes(selected.name),
      )
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 10);
  }, [allTracks, selected]);
  const sorted = useMemo(
    () =>
      sort === "name"
        ? [...artists].sort((a, b) => a.name.localeCompare(b.name))
        : artists,
    [artists, sort],
  );
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="font-mono text-[9px] tracking-[0.3em] text-dim">SORT 並び</span>
        {(["count", "name"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className="clip-tag px-3 py-1 transition-colors"
            style={{
              background: sort === s ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
              color: sort === s ? "var(--ato-bg)" : "var(--ato-text-dim)",
            }}
          >
            <span className="font-mono text-[9px] font-bold tracking-[0.2em]">{s.toUpperCase()}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {sorted.map((a) => (
          <button
            key={a.name}
            onClick={() => onSelect(selected?.name === a.name ? null : a)}
            className="clip-tag px-4 py-2 text-left transition-colors"
            style={{
              background:
                selected?.name === a.name
                  ? "var(--ato-accent)"
                  : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
              color: selected?.name === a.name ? "var(--ato-bg)" : "var(--ato-text)",
            }}
          >
            <span className="text-[13px] font-semibold">{a.name}</span>
            <span className="font-mono ml-2 text-[10px] opacity-60">{a.trackCount}</span>
          </button>
        ))}
      </div>
      {selected && topTracks.length > 0 && (
        <div className="clip-notch mt-6 p-4" style={{ border: "1px solid var(--ato-border)", borderRadius: "var(--ato-radius)" }}>
          <div className="font-mono mb-2 text-[9px] tracking-[0.35em]" style={{ color: "var(--ato-accent-2)" }}>
            TOP TRACKS 人気曲
          </div>
          {topTracks.map((t, i) => (
            <TrackRow key={t.id} track={t} index={i} context={topTracks} showAlbum />
          ))}
        </div>
      )}
      {selected && (
        <div className="mt-6 flex flex-wrap gap-5">
          {shown.map((a) => (
            <AlbumCard key={a.key} album={a} />
          ))}
        </div>
      )}
    </div>
  );
}

/** PLAYLISTS tab — LOCAL (Dexie) and CLOUD (account) playlists, kept separate. */
function PlaylistsPane() {
  const [scope, setScope] = useState<"local" | "cloud">("local");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex gap-2">
        {(
          [
            { id: "local", label: "LOCAL ローカル" },
            { id: "cloud", label: "CLOUD クラウド" },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            onClick={() => setScope(s.id)}
            className="clip-tag px-4 py-2"
            style={{
              background:
                scope === s.id ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
              color: scope === s.id ? "var(--ato-bg)" : "var(--ato-text-dim)",
            }}
          >
            <span className="font-mono text-[10px] font-bold tracking-[0.2em]">{s.label}</span>
          </button>
        ))}
      </div>
      {scope === "local" ? <LocalPlaylistsPane /> : <CloudPlaylistsPane />}
    </div>
  );
}

/** CLOUD scope — account playlists referencing cloud object keys. */
function CloudPlaylistsPane() {
  const playlists = useCloudPlaylists((s) => s.playlists);
  const plCreate = useCloudPlaylists((s) => s.create);
  const plRemove = useCloudPlaylists((s) => s.remove);
  const manifest = useCloud((s) => s.manifest);
  const playQueue = usePlayback((s) => s.playQueue);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const cloudTracks = useMemo(() => (manifest ? manifestToTracks(manifest) : []), [manifest]);
  const selected = playlists.find((p) => p.id === selectedId) ?? null;
  const resolved = useMemo(() => {
    if (!selected) return [] as TrackMeta[];
    const byKey = new Map(cloudTracks.map((t) => [t.path, t]));
    return selected.trackKeys.map((k) => byKey.get(k)).filter((t): t is TrackMeta => !!t);
  }, [selected, cloudTracks]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-6">
      {/* list column */}
      <div className="flex w-full max-h-56 shrink-0 flex-col md:max-h-none md:w-64">
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const p = plCreate(newName);
            if (p) {
              setSelectedId(p.id);
              setNewName("");
              toast("Cloud playlist created", "success", "プレイリストを作成");
            }
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New cloud playlist…"
            className="font-mono min-w-0 flex-1 bg-transparent px-3 py-2 text-[11px] outline-none"
            style={{ border: "1px solid var(--ato-border)" }}
          />
          <button type="submit" disabled={!newName.trim()} className="px-2 text-accent disabled:opacity-40" aria-label="Create">
            <Plus className="h-4 w-4" />
          </button>
        </form>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(pl.id)}
              onKeyDown={(e) => e.key === "Enter" && setSelectedId(pl.id)}
              className="group flex cursor-pointer items-center gap-2 px-3 py-2.5"
              style={{
                background:
                  pl.id === selectedId ? "color-mix(in srgb, var(--ato-accent) 12%, transparent)" : undefined,
                borderLeft: pl.id === selectedId ? "3px solid var(--ato-accent)" : "3px solid transparent",
              }}
            >
              <ListMusic className="h-3.5 w-3.5 shrink-0 text-dim" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{pl.name}</span>
                <span className="font-mono block text-[9px] text-dim">{pl.trackKeys.length} TRACKS</span>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  plRemove(pl.id);
                  if (selectedId === pl.id) setSelectedId(null);
                  toast(`Deleted ${pl.name}`, "info", "削除済み");
                }}
                className="p-1 text-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
                aria-label={`Delete ${pl.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {playlists.length === 0 && (
            <p className="mt-6 text-[12px] leading-relaxed text-dim">
              No cloud playlists. Create one here or right-click a cloud track in the CLOUD screen →{" "}
              <span style={{ color: "var(--ato-accent)" }}>Add to cloud playlist</span>.
            </p>
          )}
        </div>
      </div>

      {/* detail column */}
      <div className="flex min-w-0 flex-1 flex-col" style={{ borderLeft: "1px solid var(--ato-border)" }}>
        {selected ? (
          <>
            <div className="flex items-start justify-between gap-4 px-1 pb-4">
              <div className="min-w-0">
                <h2 className="font-display truncate text-2xl font-bold">{selected.name}</h2>
                <p className="font-mono mt-1 text-[10px] tracking-[0.25em] text-dim">
                  {resolved.length} TRACKS · CLOUD // SYNCED TO YOUR ACCOUNT
                </p>
                <button
                  onClick={() => {
                    const keys = selected.trackKeys.slice(0, 500);
                    void createShare(selected.name, keys)
                      .then((url) => navigator.clipboard.writeText(url))
                      .then(() => toast("Share link copied to clipboard", "success", "シェア"))
                      .catch((err) => toast(String(err).slice(0, 80), "error", "シェア失敗"));
                  }}
                  className="clip-tag font-mono mt-2 flex items-center gap-2 px-3 py-1.5 text-[9px] font-bold tracking-[0.2em]"
                  style={{ background: "color-mix(in srgb, var(--ato-accent-2) 12%, transparent)", color: "var(--ato-accent-2)" }}
                  title="Create a public read-only link (account mode)"
                >
                  <Share2 className="h-3 w-3" /> SHARE LINK
                </button>
              </div>
              {resolved.length > 0 && (
                <button
                  onClick={() => {
                    fx.impact(1);
                    playQueue(resolved, 0);
                  }}
                  className="clip-slash-both font-display flex shrink-0 items-center gap-2 px-5 py-2 text-[11px] font-bold tracking-[0.25em]"
                  style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
                >
                  <Play className="h-3.5 w-3.5" /> PLAY
                </button>
              )}
            </div>
            <VirtualTrackList tracks={resolved} showAlbum className="min-h-0 flex-1" />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-dim">
            Select a cloud playlist — クラウドプレイリストを選択
          </div>
        )}
      </div>
    </div>
  );
}

/** LOCAL scope — Dexie-backed playlists (existing behavior). */
/** Rule-based playlists that track the library live — tag + year + plays. */
function SmartPlaylistsSection() {
  const rules = useSmartPlaylists();
  const tracks = useAllTracks();
  const tagStats = useTagStats();
  const playQueue = usePlayback((s) => s.playQueue);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [minYear, setMinYear] = useState("");
  const [minPlays, setMinPlays] = useState("");

  if (rules.length === 0 && !creating) {
    return (
      <button
        onClick={() => setCreating(true)}
        className="clip-tag font-mono mb-4 flex w-fit items-center gap-2 px-3 py-1.5 text-[9px] font-bold tracking-[0.25em] text-dim hover:text-accent"
        style={{ background: "color-mix(in srgb, var(--ato-accent-2) 10%, transparent)", color: "var(--ato-accent-2)" }}
      >
        <Zap className="h-3 w-3" /> NEW SMART PLAYLIST — RULES THAT TRACK THE LIBRARY
      </button>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <Zap className="h-3.5 w-3.5" style={{ color: "var(--ato-accent-2)" }} />
        {rules.map((r) => {
          const count = matchSmartPlaylist(r, tracks).length;
          const active = openId === r.id;
          return (
            <span key={r.id} className="flex items-center gap-1">
              <button
                onClick={() => setOpenId(active ? null : r.id!)}
                className="clip-tag px-3 py-1.5 transition-colors"
                style={{
                  background: active ? "var(--ato-accent-2)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                  color: active ? "var(--ato-bg)" : "var(--ato-text-dim)",
                }}
                title={[r.tag, r.minYear ? `≥${r.minYear}` : null, r.minPlays ? `${r.minPlays}+ plays` : null].filter(Boolean).join(" · ")}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.15em]">{r.name.toUpperCase()}</span>
                <span className="font-mono ml-2 text-[9px] opacity-60">{count}</span>
              </button>
              <button
                onClick={() => void deleteSmartPlaylist(r.id!)}
                className="text-dim hover:text-accent"
                aria-label={`Delete ${r.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        {!creating && (
          <button onClick={() => setCreating(true)} className="font-mono text-[9px] tracking-[0.2em] text-dim hover:text-accent">
            ＋ NEW SMART
          </button>
        )}
      </div>

      {creating && (
        <form
          className="clip-notch mt-3 flex flex-wrap items-end gap-3 p-4"
          style={{ border: "1px solid var(--ato-border)", borderRadius: "var(--ato-radius)" }}
          onSubmit={(e) => {
            e.preventDefault();
            void createSmartPlaylist({
              name: name || "Smart Playlist",
              tag: tag.trim() || undefined,
              minYear: minYear ? parseInt(minYear, 10) : undefined,
              minPlays: minPlays ? parseInt(minPlays, 10) : undefined,
            }).then(() => {
              setCreating(false);
              setName("");
              setTag("");
              setMinYear("");
              setMinPlays("");
              toast("Smart playlist created", "success", "スマート再生リスト");
            });
          }}
        >
          <label className="block">
            <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">NAME</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Chill Rock"
              className="font-mono w-36 bg-transparent px-2 py-1.5 text-[11px] outline-none"
              style={{ border: "1px solid var(--ato-border)" }}
            />
          </label>
          <label className="block">
            <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">TAG</span>
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="font-mono w-32 bg-transparent px-2 py-1.5 text-[11px] outline-none"
              style={{ border: "1px solid var(--ato-border)", color: "var(--ato-text)" }}
            >
              <option value="">any</option>
              {tagStats.map((s) => (
                <option key={s.key} value={s.key} style={{ background: "var(--ato-panel)" }}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">FROM YEAR</span>
            <input
              value={minYear}
              onChange={(e) => setMinYear(e.target.value.replace(/\D/g, ""))}
              placeholder="2018"
              className="font-mono w-20 bg-transparent px-2 py-1.5 text-[11px] outline-none"
              style={{ border: "1px solid var(--ato-border)" }}
            />
          </label>
          <label className="block">
            <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">MIN PLAYS</span>
            <input
              value={minPlays}
              onChange={(e) => setMinPlays(e.target.value.replace(/\D/g, ""))}
              placeholder="3"
              className="font-mono w-16 bg-transparent px-2 py-1.5 text-[11px] outline-none"
              style={{ border: "1px solid var(--ato-border)" }}
            />
          </label>
          <button
            type="submit"
            className="clip-tag px-4 py-2"
            style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
          >
            <span className="font-mono text-[10px] font-bold tracking-[0.25em]">CREATE</span>
          </button>
          <button type="button" onClick={() => setCreating(false)} className="font-mono text-[10px] tracking-[0.2em] text-dim hover:text-accent">
            CANCEL
          </button>
        </form>
      )}

      {rules
        .filter((r) => r.id === openId)
        .map((r) => {
          const matched = matchSmartPlaylist(r, tracks);
          return (
            <div key={r.id} className="clip-notch mt-3 p-3" style={{ border: "1px solid var(--ato-border)", borderRadius: "var(--ato-radius)" }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[9px] tracking-[0.25em] text-dim">
                  {matched.length} MATCHING TRACKS — UPDATES WITH THE LIBRARY
                </span>
                {matched.length > 0 && (
                  <button
                    onClick={() => playQueue(matched, 0)}
                    className="clip-tag px-3 py-1"
                    style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
                  >
                    <span className="font-mono text-[9px] font-bold tracking-[0.2em]">PLAY ALL</span>
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {matched.map((t, i) => (
                  <TrackRow key={t.id} track={t} index={i} context={matched} showAlbum />
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function LocalPlaylistsPane() {
  const playlists = usePlaylists();
  const tracks = useAllTracks();
  const playQueue = usePlayback((s) => s.playQueue);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const selected = playlists.find((p) => p.id === selectedId) ?? null;
  const resolved = useMemo(() => {
    if (!selected) return [];
    const byId = new Map(tracks.map((t) => [t.id, t]));
    return selected.trackIds.map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
  }, [selected, tracks]);

  const totalSec = resolved.reduce((s, t) => s + (t.duration || 0), 0);
  const fmt = (s: number) => `${Math.floor(s / 60)} min`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SmartPlaylistsSection />
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-6">
      {/* list column */}
      <div className="flex w-full max-h-56 shrink-0 flex-col md:max-h-none md:w-64">
        <button
          onClick={() => {
            setCreating(true);
            setNewName("");
          }}
          className="clip-tag font-mono mb-3 flex items-center gap-2 self-start px-4 py-2 text-[10px] font-bold tracking-[0.25em]"
          style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
        >
          <Plus className="h-3.5 w-3.5" /> NEW PLAYLIST
        </button>
        {creating && (
          <form
            className="mb-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void createPlaylist(newName || "New Playlist").then((id) => {
                setSelectedId(id);
                setCreating(false);
                toast("Playlist created", "success", "プレイリストを作成");
              });
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name…"
              className="font-mono min-w-0 flex-1 bg-transparent px-3 py-2 text-[11px] outline-none"
              style={{ border: "1px solid var(--ato-border)" }}
            />
            <button type="submit" className="px-2 text-accent" aria-label="Create">
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setCreating(false)} className="px-1 text-dim" aria-label="Cancel">
              <X className="h-4 w-4" />
            </button>
          </form>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {playlists.map((pl) => (
            <PlaylistListRow
              key={pl.id}
              playlist={pl}
              active={pl.id === selectedId}
              onSelect={() => {
                setSelectedId(pl.id!);
                setEditing(false);
              }}
              onDelete={() => {
                void deletePlaylist(pl.id!).then(() => {
                  if (selectedId === pl.id) setSelectedId(null);
                  toast(`Deleted ${pl.name}`, "info", "削除済み");
                });
              }}
            />
          ))}
          {playlists.length === 0 && !creating && (
            <p className="mt-6 text-[12px] leading-relaxed text-dim">
              No playlists yet. Right-click any track → <span style={{ color: "var(--ato-accent)" }}>Add to playlist</span>,
              or create one here.
            </p>
          )}
        </div>
      </div>

      {/* detail column */}
      <div className="flex min-w-0 flex-1 flex-col" style={{ borderLeft: "1px solid var(--ato-border)" }}>
        {selected ? (
          <>
            <div className="flex items-start justify-between gap-4 px-1 pb-4">
              <div className="min-w-0">
                {editing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void renamePlaylist(selected.id!, editName || selected.name);
                      setEditing(false);
                    }}
                    className="flex gap-2"
                  >
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="font-mono min-w-0 bg-transparent px-2 py-1 text-lg font-bold outline-none"
                      style={{ border: "1px solid var(--ato-border)" }}
                    />
                    <button type="submit" className="text-accent text-xs">SAVE</button>
                    <button type="button" onClick={() => setEditing(false)} className="text-dim text-xs">CANCEL</button>
                  </form>
                ) : (
                  <h2
                    className="font-display cursor-text truncate text-2xl font-bold"
                    title="Click to rename"
                    onClick={() => {
                      setEditing(true);
                      setEditName(selected.name);
                    }}
                  >
                    {selected.name}
                  </h2>
                )}
                <p className="font-mono mt-1 text-[10px] tracking-[0.25em] text-dim">
                  {resolved.length} TRACKS {totalSec > 0 ? `· ${fmt(totalSec)}` : ""} // CLICK NAME TO RENAME
                </p>
              </div>
              {resolved.length > 0 && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => {
                      fx.impact(1);
                      playQueue(resolved, 0);
                    }}
                    className="clip-slash-both font-display flex items-center gap-2 px-5 py-2 text-[11px] font-bold tracking-[0.25em]"
                    style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
                  >
                    <Play className="h-3.5 w-3.5" /> PLAY
                  </button>
                  <button
                    onClick={() => playQueue(resolved, Math.floor(Math.random() * resolved.length))}
                    className="clip-slash-both font-display flex items-center gap-2 px-4 py-2 text-[11px] font-bold tracking-[0.25em]"
                    style={{
                      background: "color-mix(in srgb, var(--ato-accent-2) 16%, transparent)",
                      color: "var(--ato-accent-2)",
                    }}
                  >
                    <Shuffle className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            {resolved.length > 0 ? (
              <VirtualTrackList
                tracks={resolved}
                className="min-h-0 flex-1 pb-6"
                onRemove={(t) => {
                  void removeFromPlaylist(selected.id!, t.id).then(() =>
                    toast(`Removed ${t.title}`, "info", "削除済み"),
                  );
                }}
              />
            ) : (
              <p className="py-10 text-center text-[12px] text-dim">
                Empty — right-click tracks anywhere to add them.
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-dim">Select a playlist — プレイリストを選択</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function PlaylistListRow({
  playlist,
  active,
  onSelect,
  onDelete,
}: {
  playlist: Playlist;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      role="button"
      tabIndex={0}
      className="group clip-slash-both mb-1 flex cursor-pointer items-center justify-between gap-3 px-4 py-3"
      style={{
        background: active ? "color-mix(in srgb, var(--ato-accent) 12%, transparent)" : "color-mix(in srgb, var(--ato-text) 4%, transparent)",
        borderLeft: active ? "3px solid var(--ato-accent)" : "3px solid transparent",
      }}
    >
      <PlaylistCover trackIds={playlist.trackIds} title={playlist.name} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{playlist.name}</div>
        <div className="font-mono text-[9px] tracking-[0.2em] text-dim">{playlist.trackIds.length} TRACKS</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1 text-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
        aria-label={`Delete ${playlist.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// keep the dexie import used (useDexie re-export lives here for parity)
void useDexie;
