import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Check, CloudUpload, Disc3, Heart, Image as ImageIcon, Pencil, Play, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useCatalogue } from "@/core/cloud/catalogueStore";
import { useCataloguePlaylists } from "@/core/cloud/cataloguePlaylistStore";
import { useFavorites } from "@/core/cloud/favoritesStore";
import { useSync } from "@/core/cloud/syncStore";
import { catalogueReady, isAdminUser, manifestToTracks } from "@/core/cloud/cloudService";
import { useAuth } from "@/core/auth/authStore";
import { groupAlbums } from "@/core/library/useLibrary";
import { matchTrack } from "@/core/library/search";
import { usePlayback } from "@/core/audio/playbackStore";
import { useUi } from "@/state/uiStore";
import { fx } from "@/fx/FxDirector";
import { toast } from "@/state/toastStore";
import { confirm } from "@/state/confirmStore";
import { showContextMenu, type ContextMenuItem } from "@/state/contextMenuStore";
import { AlbumCard, CoverThumb, MediaRow } from "@/ui/components";
import { VirtualTrackList } from "@/ui/kit/VirtualTrackList";
import { CatalogueUploadPanel } from "@/ui/kit/CatalogueUploadPanel";
import { CataloguePlaylistCover } from "@/ui/kit/CataloguePlaylistCover";
import { PictureCropper } from "@/ui/kit/PictureCropper";
import { showTrackMenu } from "@/ui/menus";
import type { TrackMeta } from "@/core/library/types";

/**
 * CatalogueScreen: the server's shared catalogue — every signed-in account
 * can browse and stream it; the admin account organizes it here (publish
 * tracks, curate playlists, remove entries).
 */
export function CatalogueScreen() {
  const user = useAuth((s) => s.user);
  const isAdmin = !!user?.isAdmin;
  const ready = catalogueReady();
  const { manifest, status, error, refresh } = useCatalogue();
  const playlists = useCataloguePlaylists((s) => s.playlists);
  const syncing = useSync((s) => s.syncing);
  const syncResult = useSync((s) => s.result);
  const playQueue = usePlayback((s) => s.playQueue);
  const [uploadPanel, setUploadPanel] = useState(false);
  const [newPlName, setNewPlName] = useState("");
  const [q, setQ] = useState("");
  const catalogueOn = useUi((s) => s.catalogueEnabled);

  // self-heal like the Library CATALOGUE scope: a stale/failed pull retries
  // when the screen is opened; playlists follow the same lifecycle
  useEffect(() => {
    if (!ready) return;
    const c = useCatalogue.getState();
    if (c.status !== "loading" && c.manifest === null) void c.refresh();
    void useCataloguePlaylists.getState().pull();
  }, [ready, user?.id]);

  const catalogueTracks = useMemo(() => (manifest ? manifestToTracks(manifest) : []), [manifest]);
  // search filters the visible surface (albums + track table); matchTrack
  // covers title/artist/album/lyrics like the library filter
  const query = q.trim().toLowerCase();
  const visibleTracks = useMemo(
    () => (query ? catalogueTracks.filter((t) => matchTrack(t, query).hit) : catalogueTracks),
    [catalogueTracks, query],
  );
  const albums = useMemo(() => groupAlbums(visibleTracks), [visibleTracks]);

  function playTracks(list: TrackMeta[], start = 0) {
    if (list.length === 0) {
      toast("Nothing to play here yet", "info", "再生なし");
      return;
    }
    playQueue(list, start);
  }

  function playPlaylist(trackKeys: string[]) {
    const mapped = trackKeys
      .map((k) => catalogueTracks.find((t) => t.path === k))
      .filter((t): t is TrackMeta => Boolean(t));
    playTracks(mapped);
  }

  return (
    <div className="flex h-full flex-col px-5 py-5 md:px-8 md:py-7">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-wide md:text-3xl">
            CATALOGUE <span className="font-jp text-lg text-dim">カタログ</span>
          </h1>
        </div>
        <div className="font-mono flex items-center gap-2 text-[10px] tracking-[0.25em]">
          {ready && status === "ready" ? (
            <>
              <Disc3 className="h-3.5 w-3.5" style={{ color: "var(--ato-gold)" }} />
              <span style={{ color: "var(--ato-gold)" }}>{catalogueTracks.length} TRACKS · SHARED</span>
            </>
          ) : status === "loading" ? (
            <>
              <Disc3 className="h-3.5 w-3.5 animate-pulse text-dim" />
              <span className="text-dim">PULLING…</span>
            </>
          ) : status === "error" ? (
            <>
              <Disc3 className="h-3.5 w-3.5 text-dim" />
              <span className="text-dim">{error ?? "UNREACHABLE"}</span>
            </>
          ) : (
            <>
              <Disc3 className="h-3.5 w-3.5 text-dim" />
              <span className="text-dim">OFFLINE</span>
            </>
          )}
        </div>
      </header>

      {!ready && (
        <div
          className="clip-notch mb-8 bg-panel p-5 text-sm text-dim backdrop-blur-md"
          style={{ border: "1px dashed var(--ato-border)" }}
        >
          {useUi.getState().offlineMode
            ? "Offline mode: the shared catalogue is unavailable until you go back online."
            : !useUi.getState().catalogueEnabled
              ? "The shared catalogue is turned off for this device."
              : "No catalogue server found. Connect one in SETTINGS → CLOUD."}
          {!useUi.getState().offlineMode && !useUi.getState().catalogueEnabled && (
            <>
              {" "}
              <button
                className="underline hover:text-accent"
                onClick={() => {
                  useUi.getState().setCatalogueEnabled(true);
                  void useCatalogue.getState().refresh();
                }}
              >
                Turn it back on
              </button>
              .
            </>
          )}
        </div>
      )}

      {ready && (
        <>
          <div className="mb-6 flex flex-wrap gap-3">
            {isAdmin && (
              <button
                onClick={() => setUploadPanel(true)}
                disabled={!!syncing}
                className="clip-slash-both font-display flex items-center gap-2 px-6 py-2.5 text-xs font-bold tracking-[0.25em] disabled:opacity-40"
                style={{
                  background: "color-mix(in srgb, var(--ato-gold) 18%, transparent)",
                  color: "var(--ato-gold)",
                }}
                title="Pick tracks and publish them to the shared catalogue every user of this server can browse and stream"
              >
                <CloudUpload className="h-4 w-4" /> UPLOAD TO CATALOGUE
              </button>
            )}
            <button
              onClick={() => {
                void refresh();
                void useCataloguePlaylists.getState().pull();
              }}
              disabled={status === "loading"}
              className="clip-slash-both font-display flex items-center gap-2 px-6 py-2.5 text-xs font-bold tracking-[0.25em] disabled:opacity-40"
              style={{
                background: "color-mix(in srgb, var(--ato-accent-2) 16%, transparent)",
                color: "var(--ato-accent-2)",
              }}
            >
              <RefreshCw className="h-4 w-4" /> REFRESH
            </button>
            {/* the shared catalogue works signed out; this is the kill switch */}
            <button
              onClick={() => {
                const on = useUi.getState().catalogueEnabled;
                useUi.getState().setCatalogueEnabled(!on);
                if (on) useCatalogue.setState({ manifest: null, status: "idle", error: null });
                else void useCatalogue.getState().refresh();
                toast(on ? "Catalogue off: offline only" : "Catalogue on: browsing the shared library", "info", "カタログ");
              }}
              className="clip-tag font-mono px-4 py-2.5 text-[9px] tracking-[0.25em] text-dim hover:text-accent"
              style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)" }}
              title="Browse the server's shared catalogue without signing in"
            >
              {catalogueOn ? "CATALOGUE: ON" : "CATALOGUE: OFF"}
            </button>
          </div>

          {syncing && (
            <div className="mb-6">
              <div className="font-mono mb-2 flex justify-between text-[10px] text-dim">
                <span className="truncate">{syncing.current}</span>
                <span>
                  {syncing.done}/{syncing.total}
                </span>
              </div>
              <div className="h-1.5 w-full bg-line">
                <div
                  className="h-full transition-[width] duration-200"
                  style={{
                    width: syncing.total ? `${(syncing.done / syncing.total) * 100}%` : "4px",
                    background: "linear-gradient(90deg, var(--ato-accent), var(--ato-accent-2))",
                  }}
                />
              </div>
            </div>
          )}
          {syncResult && (
            <div className="font-mono mb-6 text-[10px] tracking-[0.25em]" style={{ color: "var(--ato-gold)" }}>
              {syncResult}
            </div>
          )}
        </>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* catalogue playlists: everyone plays, the admin curates */}
        {ready && (
          <div className="mb-8">
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="font-display text-sm font-bold tracking-[0.25em]">CATALOGUE PLAYLISTS</h2>
              <span className="font-jp text-[10px] tracking-[0.3em] text-dim">カタログ</span>
              <span className="h-px flex-1" style={{ background: "var(--ato-border)" }} />
            </div>
            {isAdmin && (
              <div className="mb-3 flex gap-2">
                <input
                  value={newPlName}
                  onChange={(e) => setNewPlName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newPlName.trim()) {
                      useCataloguePlaylists.getState().create(newPlName);
                      setNewPlName("");
                    }
                  }}
                  placeholder="NEW CATALOGUE PLAYLIST…"
                  className="font-mono min-w-0 flex-1 bg-transparent px-3 py-2 text-xs outline-none"
                  style={{ border: "1px solid var(--ato-border)" }}
                />
                <button
                  onClick={() => {
                    useCataloguePlaylists.getState().create(newPlName);
                    setNewPlName("");
                  }}
                  disabled={!newPlName.trim()}
                  className="clip-tag px-4 py-2 disabled:opacity-40"
                  style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)", color: "var(--ato-text-dim)" }}
                >
                  <span className="font-mono text-[10px] font-bold tracking-[0.2em]">+ CREATE</span>
                </button>
              </div>
            )}
            <div className="flex flex-col">
              {playlists.map((p) => (
                <CataloguePlaylistRow
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  trackKeys={p.trackKeys}
                  picKey={p.picKey}
                  isAdmin={isAdmin}
                  catalogueTracks={catalogueTracks}
                  onPlay={() => playPlaylist(p.trackKeys)}
                  onPlayList={playTracks}
                />
              ))}
              {playlists.length === 0 && (
                <p className="font-mono py-3 text-[10px] tracking-[0.15em] text-dim">NO CATALOGUE PLAYLISTS YET.</p>
              )}
            </div>
          </div>
        )}

        {ready && catalogueTracks.length > 0 && (
          <MediaRow title="CATALOGUE ALBUMS" jp="カタログアルバム">
            {albums.map((a) => (
              <AlbumCard key={a.key} album={a} source="catalogue" />
            ))}
          </MediaRow>
        )}

        {ready && status === "ready" && catalogueTracks.length === 0 && (
          <div className="py-14 text-center text-sm text-dim">
            {isAdmin ? (
              <>
                The catalogue is empty: hit <span style={{ color: "var(--ato-gold)" }}>UPLOAD TO CATALOGUE</span> to publish.
              </>
            ) : (
              "The catalogue is empty: the server admin has not published anything yet."
            )}
          </div>
        )}
      </div>

      {ready && catalogueTracks.length > 0 && (
        <div className="mt-4 flex h-[38vh] shrink-0 flex-col pt-2 md:h-[30vh]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 items-center gap-3">
              <h2 className="font-display whitespace-nowrap text-sm font-bold tracking-[0.25em]">ALL CATALOGUE TRACKS</h2>
              <span className="font-jp text-[10px] tracking-[0.3em] text-dim">共有</span>
              <span className="h-px w-6 shrink-0" style={{ background: "var(--ato-border)" }} />
            </div>
            <button
              onClick={() => {
                fx.impact(1);
                playQueue(visibleTracks, 0);
              }}
              className="clip-tag font-mono shrink-0 px-4 py-1.5 text-[9px] tracking-[0.3em] text-dim hover:text-accent md:order-2"
              style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)" }}
            >
              ▶ STREAM EVERYTHING
            </button>
            <label
              className="clip-tag order-last flex w-full min-w-0 items-center gap-2 px-3 py-1.5 md:order-1 md:w-auto md:max-w-[280px] md:flex-1"
              style={{ border: "1px solid var(--ato-border)" }}
            >
              <Search className="h-3 w-3 shrink-0 text-dim" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="SEARCH ・ 検索…"
                className="font-mono w-full bg-transparent text-[10px] tracking-[0.15em] outline-none placeholder:text-dim"
              />
            </label>
          </div>
          <VirtualTrackList tracks={visibleTracks} showAlbum className="min-h-0 flex-1" />
        </div>
      )}

      <CatalogueUploadPanel open={uploadPanel} onClose={() => setUploadPanel(false)} />
    </div>
  );
}

/** One catalogue playlist: cover icon + count; clicking opens the track list
 *  (everyone can play it, the admin curates inline: rename, add by search,
 *  remove entries). */
function CataloguePlaylistRow({
  id,
  name,
  trackKeys,
  picKey,
  isAdmin,
  catalogueTracks,
  onPlay,
  onPlayList,
}: {
  id: string;
  name: string;
  trackKeys: string[];
  picKey?: string | null;
  isAdmin: boolean;
  catalogueTracks: TrackMeta[];
  onPlay: () => void;
  onPlayList: (list: TrackMeta[], start: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const saved = useUi((s) => s.savedCataloguePls.includes(id));
  const [pendingPic, setPendingPic] = useState<File | null>(null);
  const picInputRef = useRef<HTMLInputElement>(null);

  const members = useMemo(
    () => trackKeys.map((k) => catalogueTracks.find((t) => t.path === k)).filter((t): t is TrackMeta => Boolean(t)),
    [trackKeys, catalogueTracks],
  );
  const query = q.trim().toLowerCase();
  const candidates = useMemo(
    () => (query ? catalogueTracks.filter((t) => matchTrack(t, query).hit).slice(0, 8) : []),
    [catalogueTracks, query],
  );

  const commitName = () => {
    if (draftName.trim() && draftName !== name) useCataloguePlaylists.getState().rename(id, draftName);
    setEditing(false);
  };

  const deleteWithConfirm = () => {
    void (async () => {
      if (!(await confirm({ title: `DELETE ${name}?`, body: "The shared playlist is removed for everyone.", danger: true }))) return;
      useCataloguePlaylists.getState().remove(id);
    })();
  };

  const openRowMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { insertNext, addToQueue } = usePlayback.getState();
    const items: ContextMenuItem[] = [
      { label: "Play playlist", jp: "再生", run: onPlay },
      ...(members.length > 0
        ? [
            {
              label: "Play next",
              jp: "次に再生",
              run: () => {
                for (const t of members) insertNext(t);
                toast(`Next: ${members.length} from ${name}`, "info", "次に再生");
              },
            },
            {
              label: "Add to queue",
              jp: "キューに追加",
              run: () => {
                for (const t of members) addToQueue(t);
                toast(`Queued ${name}`, "info", "キューに追加");
              },
            },
          ]
        : []),
      {divider: true, label: ""},
      {
        label: saved ? "Remove from your library" : "Add to your library",
        jp: "ライブラリ",
        run: () => {
          useUi.getState().toggleSavedCatalogue(id);
          toast(saved ? `Removed ${name} from your library` : `Added ${name} to your library`, "success", "ライブラリ");
        },
      },
      ...(isAdmin
        ? [
            {
              label: "Edit playlist",
              jp: "編集",
              run: () => {
                setDraftName(name);
                setEditing(true);
                setOpen(true);
              },
            },
            ...(picKey
              ? [
                  {
                    label: "Remove picture",
                    jp: "画像削除",
                    run: () => void useCataloguePlaylists.getState().setPic(id, null),
                  },
                ]
              : []),
            { label: "Delete playlist", jp: "削除", danger: true, run: deleteWithConfirm },
          ]
        : []),
    ];
    showContextMenu(e, items);
  };

  const togglePicked = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addPicked = () => {
    for (const k of picked) useCataloguePlaylists.getState().addTrack(id, k);
    if (picked.size > 0) toast(`Added ${picked.size} track${picked.size === 1 ? "" : "s"}`, "success", "プレイリストに追加");
    setPicked(new Set());
    setQ("");
  };

  return (
    <div style={{ borderBottom: "1px solid var(--ato-border)" }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
        onContextMenu={openRowMenu}
        className="group flex cursor-pointer items-center gap-3 px-3 py-2.5"
      >
        {/* the row thumbnail doubles as the change-picture control: the
            duplicate cover in the expansion was removed on purpose */}
        {isAdmin ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              picInputRef.current?.click();
            }}
            className="group/cover relative shrink-0"
            title="Change picture"
            aria-label={`Change picture for ${name}`}
          >
            <CataloguePlaylistCover tracks={members} title={name} picKey={picKey} className="h-10 w-10" />
            <span
              className="absolute inset-0 hidden items-center justify-center group-hover/cover:flex"
              style={{ background: "rgba(0,0,0,.45)", borderRadius: "var(--ato-radius)" }}
            >
              <ImageIcon className="h-3.5 w-3.5 text-white" />
            </span>
          </button>
        ) : (
          <CataloguePlaylistCover tracks={members} title={name} picKey={picKey} className="h-10 w-10" />
        )}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] ${open ? "font-medium" : "text-dim"} group-hover:text-accent`}>
            {name}
          </span>
          <span className="font-mono block text-[10px] text-dim">{trackKeys.length} TRACKS</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              useUi.getState().toggleSavedCatalogue(id);
            }}
            className="p-1 text-dim transition-opacity hover:text-accent"
            title={saved ? "In your library" : "Add to your library"}
            aria-label={saved ? `Remove ${name} from your library` : `Add ${name} to your library`}
          >
            {saved ? (
              <Check className="h-4 w-4" style={{ color: "var(--ato-accent)" }} />
            ) : (
              <Plus className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="p-1 text-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
            aria-label={`Play ${name}`}
          >
            <Play className="h-4 w-4" />
          </button>
          {isAdmin && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDraftName(name);
                  setEditing(true);
                  setOpen(true);
                }}
                className="p-1 text-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
                aria-label={`Edit ${name}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteWithConfirm();
                }}
                className="p-1 text-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
                aria-label={`Delete ${name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </span>
      </div>

      {open && (
        <div className="px-3 pb-3">
          {editing && isAdmin && (
            <div className="mb-2 flex items-center gap-2">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commitName()}
                className="font-mono min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs outline-none"
                style={{ border: "1px solid var(--ato-border)" }}
              />
              <button
                onClick={commitName}
                className="clip-tag p-1.5"
                style={{ background: "color-mix(in srgb, var(--ato-accent) 14%, transparent)", color: "var(--ato-accent)" }}
                aria-label="Save name"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setEditing(false)}
                className="clip-tag p-1.5"
                style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)", color: "var(--ato-text-dim)" }}
                aria-label="Close editor"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="mb-2 flex flex-col">
            {members.length === 0 && (
              <p className="font-mono py-1.5 text-[10px] tracking-[0.15em] text-dim">
                {isAdmin ? "EMPTY: SEARCH BELOW TO FILE TRACKS." : "EMPTY SO FAR."}
              </p>
            )}
            {members.map((t, i) => (
              <div
                key={t.path}
                role="button"
                tabIndex={0}
                onClick={() => onPlayList(members, i)}
                onKeyDown={(e) => e.key === "Enter" && onPlayList(members, i)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void showTrackMenu(e, t, members);
                }}
                className="group/row flex min-h-11 cursor-pointer items-center gap-3 py-1.5 md:min-h-0 md:gap-2 md:py-1"
              >
                <span className="font-mono w-5 shrink-0 text-right text-[10px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                <CoverThumb track={t} className="h-9 w-9 shrink-0" />
                <MemberHeart track={t} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] group-hover/row:text-accent md:text-[12px]">
                    {t.title}
                  </span>
                  <span className="block truncate text-[11px] text-dim opacity-80">{t.artist}</span>
                </span>
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      useCataloguePlaylists.getState().removeTrack(id, t.path);
                    }}
                    className="p-1.5 text-dim opacity-100 transition-opacity hover:text-accent md:opacity-0 md:group-hover/row:opacity-100"
                    aria-label={`Remove ${t.title}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {isAdmin && (
            <>
              <label className="clip-tag mb-2 flex items-center gap-2 px-2 py-1.5" style={{ border: "1px solid var(--ato-border)" }}>
                <Search className="h-3 w-3 shrink-0 text-dim" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ADD FROM CATALOGUE ・ 検索…"
                  className="font-mono w-full bg-transparent text-[10px] tracking-[0.15em] outline-none placeholder:text-dim"
                />
              </label>
              {candidates.map((t) => {
                const already = trackKeys.includes(t.path);
                const isPicked = picked.has(t.path);
                return (
                  <button
                    key={t.path}
                    disabled={already}
                    onClick={() => togglePicked(t.path)}
                    className="group flex w-full items-center gap-2 py-1 text-left disabled:opacity-40"
                    style={{
                      background: isPicked ? "color-mix(in srgb, var(--ato-accent) 10%, transparent)" : "transparent",
                      borderRadius: "var(--ato-radius)",
                    }}
                  >
                    <span
                      className="flex h-3.5 w-3.5 shrink-0 items-center justify-center"
                      style={{
                        border: `1px solid ${isPicked ? "var(--ato-accent)" : "var(--ato-border)"}`,
                        borderRadius: 3,
                        background: isPicked ? "var(--ato-accent)" : "transparent",
                        color: "var(--ato-bg)",
                      }}
                    >
                      {isPicked && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px]">
                      {t.title} <span className="text-dim opacity-60">· {t.artist}</span>
                    </span>
                    {already && <span className="font-mono shrink-0 text-[8px] tracking-[0.2em] text-dim">ADDED</span>}
                  </button>
                );
              })}
              {picked.size > 0 && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] tracking-[0.25em] text-dim">{picked.size} SELECTED</span>
                  <button
                    onClick={addPicked}
                    className="clip-tag px-4 py-1.5"
                    style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
                  >
                    <span className="font-mono text-[9px] font-bold tracking-[0.25em]">ADD {picked.size}</span>
                  </button>
                </div>
              )}
            </>
          )}

          <button
            onClick={() => onPlay()}
            className="clip-tag font-mono mt-2 flex items-center gap-1.5 px-3 py-1.5 text-[9px] tracking-[0.25em] text-dim hover:text-accent"
            style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)" }}
          >
            <Play className="h-3 w-3" /> PLAY ALL
          </button>

          <input
            ref={picInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f?.type.startsWith("image/")) setPendingPic(f);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {pendingPic && (
        <PictureCropper
          file={pendingPic}
          title="PLAYLIST PICTURE"
          onCancel={() => setPendingPic(null)}
          onConfirm={(blob) => {
            setPendingPic(null);
            void useCataloguePlaylists.getState().setPic(id, blob);
          }}
        />
      )}
    </div>
  );
}

/** like heart for a catalogue playlist member row (rides the favourites
 *  store, so it matches every other heart in the app) */
function MemberHeart({ track }: { track: TrackMeta }) {
  const liked = useFavorites((s) => s.keys.includes(track.path));
  const toggle = useFavorites((s) => s.toggle);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggle(track.path);
      }}
      className={`hidden shrink-0 p-0.5 transition-opacity md:block ${liked ? "" : "opacity-0 group-hover/row:opacity-100"}`}
      title={liked ? "Liked" : "Like"}
      aria-label={liked ? `Remove ${track.title} from liked` : `Like ${track.title}`}
    >
      <Heart
        className="h-3.5 w-3.5"
        style={{ color: liked ? "var(--ato-accent)" : undefined }}
        fill={liked ? "var(--ato-accent)" : "none"}
      />
    </button>
  );
}
