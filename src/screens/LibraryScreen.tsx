import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Download, Heart, Image as ImageIcon, ListMusic, Pin, Play, Plus, RefreshCw, Search, Share2, Shuffle, Trash2, X, Zap } from "lucide-react";
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
import {
  cloudConfigured,
  cloudMode,
  isCatalogueTrack,
  manifestToTracks,
  resolveSourceFile,
  uploadTracks,
} from "@/core/cloud/cloudService";
import { useCatalogue } from "@/core/cloud/catalogueStore";
import { useCloudPlaylists } from "@/core/cloud/playlistStore";
import { isLocalMirror } from "@/core/cloud/localPlaylistMirror";
import { AlbumCard, DirectoryInput, TrackRow } from "@/ui/components";
import { VirtualTrackList } from "@/ui/kit/VirtualTrackList";
import { AddUrlPanel } from "@/ui/kit/AddUrlPanel";
import { PlaylistCover } from "@/ui/kit/PlaylistCover";
import { PictureCropper } from "@/ui/kit/PictureCropper";
import { isTouchPrimary, supportsDirectoryPicker } from "@/core/library/importService";
import { matchTrack } from "@/core/library/search";
import { groupAlbums } from "@/core/library/useLibrary";
import { showTagMenu, showPlaylistMenu } from "@/ui/menus";
import { ScrollFade } from "@/ui/kit/ScrollFade";
import { showContextMenu } from "@/state/contextMenuStore";
import { isCached, createShare } from "@/core/cloud/cloudService";
import { useImporter } from "@/hooks/useImporter";
import { usePlayback } from "@/core/audio/playbackStore";
import { useUi } from "@/state/uiStore";
import { fx } from "@/fx/FxDirector";
import { toast } from "@/state/toastStore";
import { confirm } from "@/state/confirmStore";
import { useLikedTracks } from "@/core/cloud/likedTracks";
import { useCataloguePlaylists } from "@/core/cloud/cataloguePlaylistStore";
import { CataloguePlaylistCover } from "@/ui/kit/CataloguePlaylistCover";
import type { Playlist } from "@/core/library/db";
import type { TrackMeta } from "@/core/library/types";

type Tab = "albums" | "artists" | "tracks" | "playlists";
type Scope = "all" | "local" | "cloud" | "catalogue" | "offline";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "local", label: "LOCAL" },
  { id: "cloud", label: "CLOUD" },
  { id: "catalogue", label: "CATALOGUE" },
  { id: "offline", label: "OFFLINE" },
];

const TABS: { id: Tab; label: string; jp: string }[] = [
  { id: "tracks", label: "TRACKS", jp: "トラック" },
  { id: "playlists", label: "PLAYLISTS", jp: "プレイリスト" },
  { id: "albums", label: "ALBUMS", jp: "アルバム" },
  { id: "artists", label: "ARTISTS", jp: "アーティスト" },
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
  const [tab, setTab] = useState<Tab>("tracks");
  const playlistFocus = useUi((s) => s.playlistFocus);
  const likedFocus = useUi((s) => s.likedFocus);
  const savedCatalogueFocus = useUi((s) => s.savedCatalogueFocus);
  const cloudPlaylistFocus = useUi((s) => s.cloudPlaylistFocus);
  const artistFocus = useUi((s) => s.artistFocus);
  // PINNED rail click lands here first: flip to the playlists tab, and the
  // pane (mounting with the tab) picks up the selection itself
  useEffect(() => {
    if (playlistFocus) setTab("playlists");
  }, [playlistFocus]);
  // ...and so can Liked Songs from the rail
  useEffect(() => {
    if (likedFocus) setTab("playlists");
  }, [likedFocus]);
  // ...and saved catalogue playlists
  useEffect(() => {
    if (savedCatalogueFocus) setTab("playlists");
  }, [savedCatalogueFocus]);
  // Home search signals: open the cloud playlist, or land on the artist page
  useEffect(() => {
    if (cloudPlaylistFocus) setTab("playlists");
  }, [cloudPlaylistFocus]);
  useEffect(() => {
    if (artistFocus) setTab("artists");
  }, [artistFocus]);
  const [selectedArtist, setSelectedArtist] = useState<ArtistInfo | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [albumSort, setAlbumSort] = useState<AlbumSort>("recent");
  const [scope, setScope] = useState<Scope>("all");
  const [cachedPaths, setCachedPaths] = useState<Set<string>>(new Set());
  const albums = useAlbums();
  const tracks = useAllTracks();
  const artists = useArtists();
  const tagStats = useTagStats();
  const catalogueManifest = useCatalogue((s) => s.manifest);
  // the shared shelf, verbatim: the CATALOGUE scope reads the manifest
  // directly because the merged library only carries downloaded/liked songs
  const catalogueTracks = useMemo(
    () => (catalogueManifest ? manifestToTracks(catalogueManifest) : []),
    [catalogueManifest],
  );
  const { importDir, importList, rescan } = useImporter();
  const dirRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  const [batchTagValue, setBatchTagValue] = useState("");
  // the filter text lives in the ui store so Home's search bar can prefill it
  const filter = useUi((s) => s.libraryFilter);
  const setFilter = useUi((s) => s.setLibraryFilter);

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // IMPORT button: native folder picker where available; on phones the
  // directory input is a dead end, so a plain multi-file picker takes over
  const onImportClick = () => {
    if (supportsDirectoryPicker()) void importDir();
    else if (isTouchPrimary()) filesRef.current?.click();
    else dirRef.current?.click();
  };

  const q = filter.trim().toLowerCase();
  // opening the CATALOGUE scope with no manifest (boot fetch failed, stale
  // session, server switched elsewhere) retries the pull instead of showing
  // a silently empty list
  useEffect(() => {
    if (scope !== "catalogue") return;
    const c = useCatalogue.getState();
    if (cloudMode() === "account" && c.manifest === null && c.status !== "loading") void c.refresh();
  }, [scope]);
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
    // CLOUD = the personal namespace; CATALOGUE = any song published to the
    // shared catalogue (the visible copy may be the local one — same song)
    if (scope === "cloud") return cloud && !isCatalogueTrack(t);
    if (scope === "catalogue") return isCatalogueTrack(t);
    if (scope === "offline") return cloud && cachedPaths.has(t.path);
    return true;
  };
  const catalogueAlbums = useMemo(
    () => (scope === "catalogue" ? groupAlbums(catalogueTracks) : []),
    [scope, catalogueTracks],
  );
  const filteredAlbums = useMemo(() => {
    if (scope === "catalogue") {
      return catalogueAlbums.filter((a) => {
        if (q && !(a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q))) return false;
        if (selectedTag && !a.tracks.some((t) => trackHasTag(t, selectedTag))) return false;
        return true;
      });
    }
    return albums.filter((a) => {
      if (q && !(a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q))) return false;
      if (selectedArtist && !selectedArtist.albumKeys.includes(a.key)) return false;
      if (selectedTag && !a.tracks.some((t) => trackHasTag(t, selectedTag))) return false;
      if (scope !== "all" && !a.tracks.some(matchesScope)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albums, catalogueAlbums, q, selectedArtist, selectedTag, scope, cachedPaths]);
  const { filteredTracks, lyricsHits } = useMemo(() => {
    const base = scope === "catalogue" ? catalogueTracks : tracks;
    if (!q && !selectedTag && (scope === "all" || scope === "catalogue"))
      return { filteredTracks: base, lyricsHits: undefined as Set<number> | undefined };
    const hits = new Set<number>();
    const list = base.filter((t) => {
      if (selectedTag && !trackHasTag(t, selectedTag)) return false;
      if (scope !== "all" && scope !== "catalogue" && !matchesScope(t)) return false;
      const m = matchTrack(t, q);
      if (m.byLyrics) hits.add(t.id);
      return m.hit;
    });
    return { filteredTracks: list, lyricsHits: hits.size > 0 ? hits : undefined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, catalogueTracks, q, selectedTag, scope, cachedPaths]);
  // artists matching the active tag: same name rule as groupArtists
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
    <div className="flex h-full flex-col px-5 py-5 md:px-8 md:py-7">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="font-display text-2xl font-bold tracking-wide md:text-3xl">
          LIBRARY <span className="font-jp text-lg text-dim">ライブラリ</span>
        </h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            onClick={onImportClick}
            className="clip-tag flex items-center gap-2 px-3 py-2 md:px-4"
            style={{
              background: "color-mix(in srgb, var(--ato-accent) 14%, transparent)",
              color: "var(--ato-accent)",
            }}
            title="Import a music folder"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="font-mono text-[10px] font-bold tracking-[0.2em] md:text-[11px]">IMPORT</span>
          </button>
          <button
            onClick={() => setAddUrlOpen(true)}
            className="clip-tag flex items-center gap-2 px-3 py-2 md:px-4"
            style={{
              background: "color-mix(in srgb, var(--ato-accent) 14%, transparent)",
              color: "var(--ato-accent)",
            }}
            title="Add a track from a URL (yt-dlp companion)"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="font-mono text-[10px] font-bold tracking-[0.2em] md:text-[11px]">ADD URL</span>
          </button>
          <button
            onClick={() => void rescan()}
            className="clip-tag flex items-center gap-2 px-3 py-2 md:px-4"
            style={{
              background: "color-mix(in srgb, var(--ato-accent-2) 14%, transparent)",
              color: "var(--ato-accent-2)",
            }}
            title="Re-scan saved library folders for new/changed files"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="font-mono text-[10px] font-bold tracking-[0.2em] md:text-[11px]">RESCAN</span>
          </button>
          <DirectoryInput onFiles={(f) => void importList(f)} triggerRef={dirRef} />
          <input
            ref={filesRef}
            type="file"
            multiple
            accept="audio/*,.mp3,.flac,.wav,.ogg,.opus,.m4a,.aac,.wv,.aiff"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) void importList(files);
              e.target.value = "";
            }}
          />
          <label
            className="clip-tag flex w-full min-w-0 items-center gap-2 bg-panel px-3 py-2 sm:w-auto"
            style={{ border: "1px solid var(--ato-border)" }}
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-dim" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="SEARCH…"
              className="font-mono w-full min-w-0 bg-transparent text-[11px] tracking-[0.2em] outline-none placeholder:text-dim sm:w-44"
            />
          </label>
        </div>
      </header>

      {/* tabs */}
      <div className="no-scrollbar mb-5 flex shrink-0 items-center gap-2 overflow-x-auto md:flex-wrap">
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
            className="clip-tag shrink-0 px-3.5 py-2 md:px-4"
            style={{
              background:
                tab === t.id ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
              color: tab === t.id ? "var(--ato-bg)" : "var(--ato-text-dim)",
            }}
          >
            <span className="font-display text-[11px] font-bold tracking-[0.25em]">{t.label}</span>
            <span className="font-jp ml-2 hidden text-[9px] opacity-70 sm:inline">{t.jp}</span>
          </button>
        ))}
      </div>

      {/* library mode: all / local / cloud / offline-cached */}
      {tab !== "playlists" && (
        <div className="no-scrollbar mb-5 flex shrink-0 items-center gap-2 overflow-x-auto md:flex-wrap">
          <span className="font-mono shrink-0 text-[10px] font-bold tracking-[0.3em]" style={{ color: "var(--ato-text)" }}>
            MODE <span className="font-jp text-[9px] font-normal opacity-70">種別</span>
          </span>
          {SCOPES.map((s) => {
            const active = scope === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className="clip-tag shrink-0 px-3.5 py-1.5 transition-all"
                style={{
                  background: active
                    ? "var(--ato-accent)"
                    : "color-mix(in srgb, var(--ato-text) 10%, transparent)",
                  color: active ? "var(--ato-bg)" : "var(--ato-text)",
                  border: `1px solid ${active ? "var(--ato-accent)" : "var(--ato-border)"}`,
                  boxShadow: active ? "0 0 14px color-mix(in srgb, var(--ato-accent) 35%, transparent)" : "none",
                }}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.2em]">{s.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* popular tags: capped at POPULAR_TAG_LIMIT chips; right-click pins one as a playlist */}
      {tagStats.length > 0 && tab !== "playlists" && (
        <div className="no-scrollbar mb-5 flex shrink-0 items-center gap-2 overflow-x-auto md:flex-wrap">
          <span className="font-mono shrink-0 text-[10px] font-bold tracking-[0.3em]" style={{ color: "var(--ato-text)" }}>
            TAGS <span className="font-jp text-[9px] font-normal opacity-70">タグ</span>
          </span>
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
                className="clip-tag shrink-0 px-3.5 py-1.5 transition-all"
                style={{
                  background: active
                    ? "var(--ato-accent-2)"
                    : "color-mix(in srgb, var(--ato-accent-2) 12%, transparent)",
                  color: active ? "var(--ato-bg)" : "var(--ato-accent-2)",
                  border: `1px solid ${active ? "var(--ato-accent-2)" : "color-mix(in srgb, var(--ato-accent-2) 35%, transparent)"}`,
                }}
                title={`${s.count} tracks: right-click to pin as playlist`}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.2em]">{s.label.toUpperCase()}</span>
                <span className="font-mono ml-2 text-[9px] opacity-60">{s.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {albums.length === 0 && (scope !== "catalogue" || catalogueTracks.length === 0) && tab !== "playlists" ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="py-16 text-center">
            <ListMusic className="mx-auto h-10 w-10 text-dim" strokeWidth={1.4} />
            <p className="mt-4 text-sm text-dim">
              Nothing here yet:{" "}
              <button className="underline hover:text-accent" onClick={() => void importDir()}>
                import a folder
              </button>{" "}
              or drop files anywhere.
            </p>
          </div>
        </div>
      ) : tab === "albums" ? (
        <ScrollFade className="min-h-0 flex-1 overflow-y-auto pb-6">
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
        </ScrollFade>
      ) : tab === "artists" ? (
        <ScrollFade className="min-h-0 flex-1 overflow-y-auto pb-6">
          <ArtistPane artists={shownArtists} selected={selectedArtist} onSelect={setSelectedArtist} />
        </ScrollFade>
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
                  {selectedIds.size} SELECTED: CLICK ROWS TO TOGGLE
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
                      toast("Cloud tracks go to cloud playlists: pick local tracks only", "error", "混在できません");
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
                        run: () =>
                          useUi.getState().setPlaylistCreate({
                            seedTrackIds: [...selectedIds],
                          }),
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
  const artistFocus = useUi((s) => s.artistFocus);
  const [sort, setSort] = useState<"count" | "name">("count");
  const shown = selected ? albums.filter((a) => selected.albumKeys.includes(a.key)) : [];
  // Home search hands over an artist name: select it once the list resolves
  useEffect(() => {
    if (!artistFocus) return;
    const a = artists.find((x) => x.name === artistFocus.name);
    if (a) onSelect(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistFocus, artists]);
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

/** PLAYLISTS tab: LOCAL (Dexie) and CLOUD (account) playlists, kept separate. */
function PlaylistsPane() {
  const [scope, setScope] = useState<"local" | "cloud">("local");
  const cloudPlaylistFocus = useUi((s) => s.cloudPlaylistFocus);
  // arriving via a Home search hit on a cloud playlist flips the scope
  useEffect(() => {
    if (cloudPlaylistFocus) setScope("cloud");
  }, [cloudPlaylistFocus]);
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

/** CLOUD scope: account playlists referencing cloud object keys. */
function CloudPlaylistsPane() {
  const playlists = useCloudPlaylists((s) => s.playlists);
  const cloudPlaylistFocus = useUi((s) => s.cloudPlaylistFocus);
  const plCreate = useCloudPlaylists((s) => s.create);
  const plRemove = useCloudPlaylists((s) => s.remove);
  const manifest = useCloud((s) => s.manifest);
  const playQueue = usePlayback((s) => s.playQueue);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  // Home search hands over a cloud playlist id
  useEffect(() => {
    if (cloudPlaylistFocus) setSelectedId(cloudPlaylistFocus.id);
  }, [cloudPlaylistFocus]);

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
        <ScrollFade className="min-h-0 flex-1 overflow-y-auto">
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
                <span className="block truncate text-[13px] font-medium">
                  {pl.name}
                  {isLocalMirror(pl) && (
                    <span className="font-mono ml-2 align-middle text-[8px] tracking-[0.25em]" style={{ color: "var(--ato-accent-2)" }}>
                      SYNC
                    </span>
                  )}
                </span>
                <span className="font-mono block text-[9px] text-dim">{pl.trackKeys.length} TRACKS</span>
              </span>
              {!isLocalMirror(pl) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void (async () => {
                      if (!(await confirm({ title: `DELETE ${pl.name}?`, danger: true }))) return;
                      plRemove(pl.id);
                      if (selectedId === pl.id) setSelectedId(null);
                      toast(`Deleted ${pl.name}`, "info", "削除済み");
                    })();
                  }}
                  className="p-1 text-dim opacity-100 transition-opacity hover:text-accent md:opacity-0 md:group-hover:opacity-100"
                  aria-label={`Delete ${pl.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {playlists.length === 0 && (
            <p className="mt-6 text-[12px] leading-relaxed text-dim">
              No cloud playlists. Create one here or right-click a cloud track in the CLOUD screen →{" "}
              <span style={{ color: "var(--ato-accent)" }}>Add to cloud playlist</span>.
            </p>
          )}
        </ScrollFade>
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
            Select a cloud playlist · クラウドプレイリストを選択
          </div>
        )}
      </div>
    </div>
  );
}

/** LOCAL scope: Dexie-backed playlists (existing behavior). */
/** Rule-based playlists that track the library live: tag + year + plays. */
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
        <Zap className="h-3 w-3 shrink-0" />
        <span className="hidden sm:inline">NEW SMART PLAYLIST: RULES THAT TRACK THE LIBRARY</span>
        <span className="sm:hidden">NEW SMART PLAYLIST</span>
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
                  {matched.length} MATCHING TRACKS: UPDATES WITH THE LIBRARY
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
              <ScrollFade className="max-h-72 overflow-y-auto">
                {matched.map((t, i) => (
                  <TrackRow key={t.id} track={t} index={i} context={matched} showAlbum />
                ))}
              </ScrollFade>
            </div>
          );
        })}
    </div>
  );
}

const LIKED_ID = -1; // pseudo-playlist id for the Liked Songs view

function LocalPlaylistsPane() {
  const playlists = usePlaylists();
  const tracks = useAllTracks();
  const playQueue = usePlayback((s) => s.playQueue);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const playlistFocus = useUi((s) => s.playlistFocus);
  const likedFocus = useUi((s) => s.likedFocus);
  const savedCatalogueFocus = useUi((s) => s.savedCatalogueFocus);
  const savedCatIds = useUi((s) => s.savedCataloguePls);
  const catPlaylists = useCataloguePlaylists((s) => s.playlists);
  const liked = useLikedTracks();
  const catManifest = useCatalogue((s) => s.manifest);
  // saved catalogue playlists resolve against the SHARED manifest: members
  // need not be liked/downloaded to show up in the playlist the user saved
  const catalogueTracks = useMemo(
    () => (catManifest ? manifestToTracks(catManifest) : []),
    [catManifest],
  );
  // the left rail can summon a playlist from any view (PINNED section)
  useEffect(() => {
    if (playlistFocus) setSelectedId(playlistFocus.id);
  }, [playlistFocus]);
  useEffect(() => {
    if (likedFocus) setSelectedId(LIKED_ID);
  }, [likedFocus]);
  useEffect(() => {
    if (savedCatalogueFocus) setSelectedId(`cat-${savedCatalogueFocus.id}`);
  }, [savedCatalogueFocus]);
  const savedCat = useMemo(
    () => catPlaylists.filter((p) => savedCatIds.includes(p.id)).map((p) => ({ ...p, key: `cat-${p.id}` })),
    [catPlaylists, savedCatIds],
  );
  const savedCatSelected = useMemo(
    () => savedCat.find((p) => p.key === selectedId) ?? null,
    [savedCat, selectedId],
  );
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const selected = playlists.find((p) => p.id === selectedId) ?? null;
  const likedSelected = selectedId === LIKED_ID;
  const resolved = useMemo(() => {
    if (likedSelected) return liked;
    if (savedCatSelected) {
      const byPath = new Map(catalogueTracks.map((t) => [t.path, t]));
      return savedCatSelected.trackKeys.map((k) => byPath.get(k)).filter((t): t is NonNullable<typeof t> => !!t);
    }
    if (!selected) return [];
    const byId = new Map(tracks.map((t) => [t.id, t]));
    return selected.trackIds.map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
  }, [likedSelected, liked, savedCatSelected, selected, tracks, catalogueTracks]);

  const totalSec = resolved.reduce((s, t) => s + (t.duration || 0), 0);
  const fmt = (s: number) => `${Math.floor(s / 60)} min`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SmartPlaylistsSection />
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-6">
      {/* list column */}
      <div className="flex w-full max-h-56 shrink-0 flex-col md:max-h-none md:w-64">
        <button
          onClick={() => useUi.getState().setPlaylistCreate({ onCreated: (id) => setSelectedId(id) })}
          className="clip-tag font-mono mb-3 flex items-center gap-2 self-start px-4 py-2 text-[10px] font-bold tracking-[0.25em]"
          style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
        >
          <Plus className="h-3.5 w-3.5" /> NEW PLAYLIST
        </button>
        <ScrollFade className="min-h-0 flex-1 overflow-y-auto">
          {/* Liked Songs: always first, styled exactly like the rows below */}
          <button
            onClick={() => {
              setSelectedId(LIKED_ID);
              setEditing(false);
            }}
            className={`group clip-slash-both mb-1 flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left`}
            style={{
              background: likedSelected
                ? "color-mix(in srgb, var(--ato-accent) 12%, transparent)"
                : "color-mix(in srgb, var(--ato-text) 4%, transparent)",
              borderLeft: likedSelected ? "3px solid var(--ato-accent)" : "3px solid transparent",
            }}
          >
            <span className="relative shrink-0">
              <span
                className="flex h-10 w-10 items-center justify-center"
                style={{
                  borderRadius: "var(--ato-radius)",
                  background: "linear-gradient(135deg, var(--ato-accent), var(--ato-accent-2))",
                }}
              >
                <Heart className="h-4 w-4" fill="var(--ato-bg)" style={{ color: "var(--ato-bg)" }} />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-[13px] font-semibold"
                style={{ color: likedSelected ? "var(--ato-accent)" : "var(--ato-text-dim)" }}
              >
                Liked Songs
              </span>
              <span className="font-mono block text-[9px] tracking-[0.2em] text-dim">{liked.length} TRACKS</span>
            </span>
          </button>
          {savedCat.map((p) => (
            <div
              key={p.key}
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedId(p.key);
                setEditing(false);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                showContextMenu(e, [
                  {
                    label: "Remove from your library",
                    jp: "ライブラリから削除",
                    run: () => {
                      useUi.getState().toggleSavedCatalogue(p.id);
                      if (selectedId === p.key) setSelectedId(null);
                      toast(`Removed ${p.name} from your library`, "info", "削除済み");
                    },
                  },
                ]);
              }}
              className={`group clip-slash-both mb-1 flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left`}
              style={{
                background: selectedId === p.key
                  ? "color-mix(in srgb, var(--ato-accent) 12%, transparent)"
                  : "color-mix(in srgb, var(--ato-text) 4%, transparent)",
                borderLeft: selectedId === p.key ? "3px solid var(--ato-accent)" : "3px solid transparent",
              }}
            >
              <span className="shrink-0">
                <CataloguePlaylistCover
                  tracks={catalogueTracks.filter((t) => p.trackKeys.includes(t.path)).slice(0, 16)}
                  title={p.name}
                  picKey={p.picKey}
                  className="h-10 w-10"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[13px] font-semibold"
                  style={{ color: selectedId === p.key ? "var(--ato-accent)" : "var(--ato-text-dim)" }}
                >
                  {p.name}
                </span>
                <span className="font-mono block text-[9px] tracking-[0.2em] text-dim">
                  {p.trackKeys.length} TRACKS · <span style={{ color: "var(--ato-gold)" }}>CTL</span>
                </span>
              </span>
            </div>
          ))}
          {playlists.map((pl) => (
            <PlaylistListRow
              key={pl.id}
              playlist={pl}
              active={pl.id === selectedId}
              onSelect={() => {
                setSelectedId(pl.id!);
                setEditing(false);
              }}
              onRename={() => {
                setSelectedId(pl.id!);
                setEditing(true);
                setEditName(pl.name);
              }}
              onDelete={() => {
                void (async () => {
                  if (!(await confirm({ title: `DELETE ${pl.name}?`, danger: true }))) return;
                  void deletePlaylist(pl.id!).then(() => {
                    if (selectedId === pl.id) setSelectedId(null);
                    toast(`Deleted ${pl.name}`, "info", "削除済み");
                  });
                })();
              }}
            />
          ))}
          {playlists.length === 0 && !creating && (
            <p className="mt-6 text-[12px] leading-relaxed text-dim">
              No playlists yet. Right-click any track → <span style={{ color: "var(--ato-accent)" }}>Add to playlist</span>,
              or create one here.
            </p>
          )}
        </ScrollFade>
      </div>

      {/* detail column */}
      <div className="flex min-w-0 flex-1 flex-col" style={{ borderLeft: "1px solid var(--ato-border)" }}>
        {savedCatSelected ? (
          <>
            <div className="flex items-start justify-between gap-4 px-1 pb-4">
              <div className="flex min-w-0 items-center gap-4">
                <CataloguePlaylistCover
                  tracks={resolved}
                  title={savedCatSelected.name}
                  picKey={savedCatSelected.picKey}
                  className="h-20 w-20"
                />
                <div className="min-w-0">
                  <h2 className="font-display truncate text-2xl font-bold">{savedCatSelected.name}</h2>
                  <p className="font-mono mt-1 text-[10px] tracking-[0.25em] text-dim">
                    {resolved.length} TRACKS {totalSec > 0 ? `· ${fmt(totalSec)}` : ""} //{" "}
                    <span style={{ color: "var(--ato-gold)" }}>CATALOGUE · SHARED</span> // CURATED BY THE SERVER
                  </p>
                </div>
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
              <VirtualTrackList tracks={resolved} className="min-h-0 flex-1 pb-6" />
            ) : (
              <p className="font-mono px-1 py-10 text-[11px] leading-relaxed tracking-[0.1em] text-dim">
                THE SERVER'S CURATOR HASN'T FILED ANY TRACKS YET.
              </p>
            )}
          </>
        ) : likedSelected ? (
          <>
            <div className="flex items-start justify-between gap-4 px-1 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <Heart className="h-5 w-5 shrink-0" fill="var(--ato-accent)" style={{ color: "var(--ato-accent)" }} />
                <div className="min-w-0">
                  <h2 className="font-display truncate text-2xl font-bold">Liked Songs</h2>
                  <p className="font-mono mt-1 text-[10px] tracking-[0.25em] text-dim">
                    {liked.length} TRACKS {totalSec > 0 ? `· ${fmt(totalSec)}` : ""} // お気に入り
                  </p>
                </div>
              </div>
              {liked.length > 0 && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => {
                      fx.impact(1);
                      playQueue(liked, 0);
                    }}
                    className="clip-slash-both font-display flex items-center gap-2 px-5 py-2 text-[11px] font-bold tracking-[0.25em]"
                    style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
                  >
                    <Play className="h-3.5 w-3.5" /> PLAY
                  </button>
                  <button
                    onClick={() => playQueue(liked, Math.floor(Math.random() * liked.length))}
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
            {liked.length > 0 ? (
              <VirtualTrackList tracks={liked} className="min-h-0 flex-1 pb-6" />
            ) : (
              <p className="font-mono px-1 py-10 text-[11px] leading-relaxed tracking-[0.1em] text-dim">
                NOTHING LIKED YET // TAP THE HEART ON ANY TRACK
              </p>
            )}
          </>
        ) : selected ? (
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
                  {cloudConfigured() && (
                    <button
                      onClick={() => {
                        toast(`Uploading ${resolved.length} tracks…`, "info", "アップロード");
                        void (async () => {
                          try {
                            const r = await uploadTracks(resolved, resolveSourceFile, undefined, async (k) => (await db.covers.get(k))?.blob ?? null);
                            // mirror it as a cloud playlist with the same name
                            const cloudPls = useCloudPlaylists.getState().playlists;
                            const mirror = cloudPls.find((p) => p.name === selected.name) ?? useCloudPlaylists.getState().create(selected.name);
                            if (mirror) for (const t of resolved) useCloudPlaylists.getState().addTrack(mirror.id, t.path);
                            await useCloud.getState().refresh();
                            toast(
                              r.failed
                                ? `Uploaded with ${r.failed} failures`
                                : r.manifestWritten
                                  ? `Uploaded "${selected.name}" to the cloud`
                                  : `Uploaded "${selected.name}", cloud list unreachable: retry later`,
                              r.failed || !r.manifestWritten ? "error" : "success",
                              "クラウド",
                            );
                          } catch {
                            toast("Upload failed", "error", "アップロード失敗");
                          }
                        })();
                      }}
                      className="clip-slash-both font-display flex items-center gap-2 px-4 py-2 text-[11px] font-bold tracking-[0.25em]"
                      style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)", color: "var(--ato-text-dim)" }}
                      title="Upload every track in this playlist and mirror it to your cloud playlists"
                    >
                      <Download className="h-3.5 w-3.5 rotate-180" /> UPLOAD
                    </button>
                  )}
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
                Empty: right-click tracks anywhere to add them.
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-dim">Select a playlist · プレイリストを選択</p>
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
  onRename,
  onDelete,
}: {
  playlist: Playlist;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const picInput = useRef<HTMLInputElement>(null);
  const [pendingPic, setPendingPic] = useState<File | null>(null);
  const pinned = useUi((s) => s.pinnedPlaylists.includes(playlist.id!));
  const openMenu = (e: ReactMouseEvent) => showPlaylistMenu(e, playlist, { onRename, onDelete });
  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      onContextMenu={openMenu}
      role="button"
      tabIndex={0}
      className="group clip-slash-both mb-1 flex cursor-pointer items-center justify-between gap-3 px-4 py-3"
      style={{
        background: active ? "color-mix(in srgb, var(--ato-accent) 12%, transparent)" : "color-mix(in srgb, var(--ato-text) 4%, transparent)",
        borderLeft: active ? "3px solid var(--ato-accent)" : "3px solid transparent",
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          picInput.current?.click();
        }}
        className="relative shrink-0"
        title="Change picture"
        aria-label={`Change picture for ${playlist.name}`}
      >
        <PlaylistCover trackIds={playlist.trackIds} title={playlist.name} pic={playlist.pic} className="h-10 w-10" />
        <span
          className="absolute inset-0 hidden items-center justify-center group-hover:flex"
          style={{ background: "rgba(0,0,0,.45)", borderRadius: "var(--ato-radius)" }}
        >
          <ImageIcon className="h-3.5 w-3.5 text-white" />
        </span>
      </button>
      <input
        ref={picInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f?.type.startsWith("image/")) setPendingPic(f);
          e.target.value = "";
        }}
      />
      {pendingPic && (
        <PictureCropper
          file={pendingPic}
          title="PLAYLIST PICTURE"
          onCancel={() => setPendingPic(null)}
          onConfirm={(blob) => {
            setPendingPic(null);
            void db.playlists.update(playlist.id!, { pic: blob }).then(() => toast("Playlist picture updated", "success", "カバー更新"));
          }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{playlist.name}</div>
        <div className="font-mono text-[9px] tracking-[0.2em] text-dim">{playlist.trackIds.length} TRACKS</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          useUi.getState().togglePinnedPlaylist(playlist.id!);
        }}
        className={`p-1 transition-opacity ${pinned ? "text-accent" : "text-dim opacity-0 group-hover:opacity-100 hover:text-accent"}`}
        title={pinned ? "Unpin from sidebar" : "Pin to sidebar"}
        aria-label={pinned ? `Unpin ${playlist.name}` : `Pin ${playlist.name}`}
      >
        <Pin className="h-3.5 w-3.5" fill={pinned ? "currentColor" : "none"} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1 text-dim opacity-100 transition-opacity hover:text-accent md:opacity-0 md:group-hover:opacity-100"
        aria-label={`Delete ${playlist.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// keep the dexie import used (useDexie re-export lives here for parity)
void useDexie;
