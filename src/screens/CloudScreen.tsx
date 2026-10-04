import { useEffect, useMemo, useState } from "react";
import { Check, CloudDownload, CloudUpload, Heart, ListMusic, Pencil, RefreshCw, Search, Server, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { useCloud } from "@/core/cloud/cloudStore";
import {
  cloudConfigured,
  CloudAuthError,
  manifestToTracks,
  testConnection,
  cacheTrack,
} from "@/core/cloud/cloudService";
import { useSync } from "@/core/cloud/syncStore";
import {
  activateDefaultServer,
  saveActiveConnection,
} from "@/core/cloud/sources";
import { defaultServerConfigured } from "@/core/cloud/defaults";
import { SavedServers } from "./CloudScreenSavedServers";
import { accountActive, type CloudPlaylist } from "@/core/cloud/accountService";
import { useFavorites } from "@/core/cloud/favoritesStore";
import { useCloudPlaylists } from "@/core/cloud/playlistStore";
import { isLocalMirror } from "@/core/cloud/localPlaylistMirror";
import { usePlayStats } from "@/core/cloud/playStats";
import { useAuth } from "@/core/auth/authStore";
import { db } from "@/core/library/db";
import { groupAlbums } from "@/core/library/useLibrary";
import { usePlayback } from "@/core/audio/playbackStore";
import { useUi } from "@/state/uiStore";
import { fx } from "@/fx/FxDirector";
import { toast } from "@/state/toastStore";
import { confirm } from "@/state/confirmStore";
import { showContextMenu, type ContextMenuItem } from "@/state/contextMenuStore";
import type { TrackMeta } from "@/core/library/types";
import { AlbumCard, MediaRow } from "@/ui/components";
import { VirtualTrackList } from "@/ui/kit/VirtualTrackList";
import { useCatalogue } from "@/core/cloud/catalogueStore";

/**
 * CloudScreen: browse + play the R2-backed library.
 * Streams through the atori-cloud worker; per-album offline caching.
 */
export function CloudScreen() {
  const { manifest, status, error, refresh } = useCloud();
  const cloudUrl = useUi((s) => s.cloudUrl);
  const offlineMode = useUi((s) => s.offlineMode);
  const cloudSetupDone = useUi((s) => s.cloudSetupDone);
  const savedServers = useUi((s) => s.savedServers);
  // sync state is global: it keeps running (and stays visible here) across navigation
  const syncing = useSync((s) => s.syncing);
  const syncResult = useSync((s) => s.result);
  const [caching, setCaching] = useState<string | null>(null);
  const [newPlName, setNewPlName] = useState("");
  const playQueue = usePlayback((s) => s.playQueue);
  const favKeys = useFavorites((s) => s.keys);
  const toggleSaved = useFavorites((s) => s.toggle);
  const playlists = useCloudPlaylists((s) => s.playlists);
  const plCreate = useCloudPlaylists((s) => s.create);
  const plRemove = useCloudPlaylists((s) => s.remove);
  const user = useAuth((s) => s.user);
  const authServerUrl = useAuth((s) => s.serverUrl);
  const authSessionToken = useAuth((s) => s.sessionToken);

  // auto-capture the active connection into the saved-server list
  // (account logins from the auth screen land here too)
  useEffect(() => {
    if (authSessionToken && authServerUrl && user) saveActiveConnection();
  }, [authSessionToken, authServerUrl, user?.id]);

  useEffect(() => {
    // idle = fresh session; error = a transient boot-time failure (network not
    // up yet): retrying on open keeps the library from looking empty
    if (cloudConfigured() && (status === "idle" || status === "error")) void refresh();
  }, [status, refresh]);

  // pull account favorites + playlists when signed in
  useEffect(() => {
    if (accountActive()) {
      void useFavorites.getState().pull();
      void useCloudPlaylists.getState().pull();
      void usePlayStats.getState().pull();
      void useCatalogue.getState().refresh();
      void import("@/core/cloud/cataloguePlaylistStore").then((m) => m.useCataloguePlaylists.getState().pull());
    }
  }, [user?.id]);

  const cloudTracks = manifest ? manifestToTracks(manifest) : [];
  // search filters the visible surface (albums + track table)
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const visibleTracks = useMemo(
    () => (query ? cloudTracks.filter((t) => (t.title + " " + t.artist + " " + t.album).toLowerCase().includes(query)) : cloudTracks),
    [cloudTracks, query],
  );
  const albums = groupAlbums(visibleTracks);
  const savedTracks = cloudTracks.filter((t) => favKeys.includes(t.path));

  function playTracks(list: TrackMeta[], start = 0) {
    if (list.length === 0) {
      toast("Nothing to play here yet: add some tracks", "info", "再生なし");
      return;
    }
    playQueue(list, start);
  }

  function playPlaylist(p: CloudPlaylist) {
    const mapped = p.trackKeys
      .map((k) => cloudTracks.find((t) => t.path === k))
      .filter((t): t is TrackMeta => Boolean(t));
    playTracks(mapped);
  }

  const doSync = async () => {
    await useSync.getState().start();
  };

  const cacheAlbum = async (albumKey: string) => {
    const album = albums.find((a) => a.key === albumKey);
    if (!album) return;
    setCaching(album.name);
    try {
      for (const t of album.tracks) await cacheTrack(t.path);
      toast(`${album.name} cached offline`, "success", "オフライン保存");
    } catch (e) {
      if (e instanceof CloudAuthError) {
        useAuth.getState().setSessionExpired(true);
        useAuth.getState().setAuthOpen(true);
        toast("Session expired: sign in again", "error", "セッション切れ");
      } else {
        toast(`Cache failed for ${album.name}`, "error");
      }
    } finally {
      setCaching(null);
    }
  };

  return (
    <div className="flex h-full flex-col px-8 py-7">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-wide">
            CLOUD <span className="font-jp text-lg text-dim">クラウド</span>
          </h1>
        </div>
        <div className="font-mono flex items-center gap-2 text-[10px] tracking-[0.25em]">
          {status === "ready" ? (
            <>
              <Wifi className="h-3.5 w-3.5" style={{ color: "var(--ato-accent-2)" }} />
              <span style={{ color: "var(--ato-accent-2)" }}>
                {manifest?.tracks.length ?? 0} OBJECTS
              </span>
            </>
          ) : status === "loading" ? (
            <>
              <Wifi className="h-3.5 w-3.5 animate-pulse text-dim" />
              <span className="text-dim">LINKING…</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-dim" />
              <span className="text-dim">{status === "error" ? error : "OFFLINE"}</span>
            </>
          )}
        </div>
      </header>

      {/* first-run connection chooser: or the offline banner while it's on */}
      {!cloudSetupDone && !offlineMode ? (
        <div
          className="clip-notch mb-6 bg-panel p-5 backdrop-blur-md"
          style={{ border: "1px solid var(--ato-border)" }}
        >
          <div className="font-mono mb-1 text-[10px] tracking-[0.35em]" style={{ color: "var(--ato-accent)" }}>
            HOW SHOULD ATRI CONNECT?
          </div>
          <p className="mb-4 text-sm text-dim">
            Pick where your library lives: changeable anytime. 自分のサーバーも使えます。
          </p>
          <div className="flex flex-wrap gap-3">
            {defaultServerConfigured() && (
              <button
                onClick={() => {
                  if (activateDefaultServer()) {
                    toast("Sign in to the default server", "info", "サインイン");
                  }
                }}
                className="clip-slash-both font-display flex items-center gap-2 px-5 py-2.5 text-xs font-bold tracking-[0.2em]"
                style={{
                  background: "var(--ato-accent)",
                  color: "var(--ato-bg)",
                  boxShadow: "0 0 24px color-mix(in srgb, var(--ato-accent) 35%, transparent)",
                }}
              >
                <Wifi className="h-4 w-4" /> USE ATRI CLOUD (DEFAULT)
              </button>
            )}
            <button
              onClick={() => {
                useUi.getState().setCloudSetupDone(true);
                useUi.getState().navigate("settings");
                toast("Connect your own worker: see README to deploy one", "info", "自分のサーバー");
              }}
              className="clip-slash-both font-display flex items-center gap-2 px-5 py-2.5 text-xs font-bold tracking-[0.2em]"
              style={{ background: "color-mix(in srgb, var(--ato-accent-2) 16%, transparent)", color: "var(--ato-accent-2)" }}
            >
              <Server className="h-4 w-4" /> MY OWN SERVER
            </button>
            <button
              onClick={() => {
                useUi.getState().setOfflineMode(true);
                useUi.getState().setCloudSetupDone(true);
                toast("Offline mode: using saved music locally", "success", "オフライン");
              }}
              className="clip-slash-both font-display flex items-center gap-2 px-5 py-2.5 text-xs font-bold tracking-[0.2em]"
              style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)", color: "var(--ato-text-dim)" }}
            >
              <WifiOff className="h-4 w-4" /> WORK OFFLINE
            </button>
          </div>
        </div>
      ) : offlineMode ? (
        <div
          className="clip-notch mb-6 flex flex-wrap items-center justify-between gap-3 bg-panel p-4 backdrop-blur-md"
          style={{ border: "1px dashed var(--ato-border)" }}
        >
          <span className="font-mono flex items-center gap-2 text-[10px] tracking-[0.25em] text-dim">
            <WifiOff className="h-4 w-4" />
            OFFLINE MODE: PLAYING SAVED MUSIC ONLY
          </span>
          <button
            onClick={() => {
              useUi.getState().setOfflineMode(false);
              if (savedServers.length === 0) useUi.getState().setCloudSetupDone(false);
              toast("Back online: pick a server", "info", "オンライン");
            }}
            className="clip-tag px-4 py-2"
            style={{ background: "color-mix(in srgb, var(--ato-accent-2) 14%, transparent)", color: "var(--ato-accent-2)" }}
          >
            <span className="font-mono text-[10px] font-bold tracking-[0.25em]">GO ONLINE</span>
          </button>
        </div>
      ) : null}

      {/* saved server connections: click to switch where your library lives */}
      <SavedServers />

      {/* scrollable middle: config hint + actions + albums */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!cloudConfigured() && (
          <div
            className="clip-notch mb-8 bg-panel p-5 text-sm text-dim backdrop-blur-md"
            style={{ border: "1px dashed var(--ato-border)" }}
          >
            Configure your atori-cloud worker endpoint in{" "}
            <button className="underline hover:text-accent" onClick={() => useUi.getState().navigate("settings")}>
              SETTINGS → CLOUD
            </button>, then sync your local library up and stream it anywhere.
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-3">
          <button
            onClick={() => void doSync()}
            disabled={!cloudConfigured() || !!syncing}
            className="clip-slash-both font-display flex items-center gap-2 px-6 py-2.5 text-xs font-bold tracking-[0.25em] disabled:opacity-40"
            style={{
              background: "var(--ato-accent)",
              color: "var(--ato-bg)",
              boxShadow: "0 0 24px color-mix(in srgb, var(--ato-accent) 35%, transparent)",
            }}
          >
            <CloudUpload className="h-4 w-4" /> SYNC LIBRARY UP
          </button>
          <button
            onClick={() => void refresh()}
            disabled={!cloudConfigured()}
            className="clip-slash-both font-display flex items-center gap-2 px-6 py-2.5 text-xs font-bold tracking-[0.25em] disabled:opacity-40"
            style={{
              background: "color-mix(in srgb, var(--ato-accent-2) 16%, transparent)",
              color: "var(--ato-accent-2)",
            }}
          >
            <RefreshCw className="h-4 w-4" /> REFRESH MANIFEST
          </button>
          <button
            onClick={() => useUi.getState().navigate("settings")}
            className="clip-slash-both font-display flex items-center gap-2 px-6 py-2.5 text-xs font-bold tracking-[0.25em]"
            style={{
              background: "color-mix(in srgb, var(--ato-text) 6%, transparent)",
              color: "var(--ato-text-dim)",
            }}
          >
            <Wifi className="h-4 w-4" /> CONFIG
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

        {/* saved (account favorites) */}
        {savedTracks.length > 0 && (
          <div className="mb-8">
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="font-display text-sm font-bold tracking-[0.25em]">SAVED</h2>
              <span className="font-jp text-[10px] tracking-[0.3em] text-dim">お気に入り</span>
              <span className="h-px flex-1" style={{ background: "var(--ato-border)" }} />
            </div>
            <div>
              {savedTracks.map((t, i) => (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => playTracks(savedTracks, i)}
                  onKeyDown={(e) => e.key === "Enter" && playTracks(savedTracks, i)}
                  className="group grid h-11 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 text-left"
                  style={{ borderBottom: "1px solid var(--ato-border)" }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium group-hover:text-accent">{t.title}</span>
                    <span className="block truncate text-[11px] text-dim">{t.artist}</span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSaved(t.path);
                    }}
                    className="p-1 opacity-70 transition-opacity hover:opacity-100"
                    aria-label={`Unsave ${t.title}`}
                  >
                    <Heart className="h-4 w-4" fill="var(--ato-accent)" style={{ color: "var(--ato-accent)" }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* cloud playlists (accounts mode) */}
        {accountActive() && (
          <div className="mb-8">
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="font-display text-sm font-bold tracking-[0.25em]">CLOUD PLAYLISTS</h2>
              <span className="font-jp text-[10px] tracking-[0.3em] text-dim">クラウド</span>
              <span className="h-px flex-1" style={{ background: "var(--ato-border)" }} />
            </div>
            <div className="mb-3 flex gap-2">
              <input
                value={newPlName}
                onChange={(e) => setNewPlName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPlName.trim()) {
                    plCreate(newPlName);
                    setNewPlName("");
                  }
                }}
                placeholder="NEW PLAYLIST NAME…"
                className="font-mono min-w-0 flex-1 bg-transparent px-3 py-2 text-xs outline-none"
                style={{ border: "1px solid var(--ato-border)" }}
              />
              <button
                onClick={() => {
                  plCreate(newPlName);
                  setNewPlName("");
                }}
                disabled={!newPlName.trim()}
                className="clip-tag px-4 py-2 disabled:opacity-40"
                style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)", color: "var(--ato-text-dim)" }}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.2em]">+ CREATE</span>
              </button>
            </div>
            <div className="flex flex-col">
              {playlists.map((p) => (
                <CloudPlaylistRow
                  key={p.id}
                  playlist={p}
                  cloudTracks={cloudTracks}
                  onPlay={() => playPlaylist(p)}
                  onRemove={() => {
                    plRemove(p.id);
                    toast(`Deleted ${p.name}`, "info", "削除済み");
                  }}
                />
              ))}
              {playlists.length === 0 && (
                <p className="font-mono py-3 text-[10px] tracking-[0.15em] text-dim">
                  NO CLOUD PLAYLISTS AVAILABLE.
                </p>
              )}
            </div>
          </div>
        )}

        {status === "ready" && cloudTracks.length > 0 ? (
          <>
            <MediaRow title="CLOUD ALBUMS" jp="クラウドアルバム">
              {albums.map((a) => (
                <div key={a.key} className="flex flex-col items-start">
                  <AlbumCard album={a} source="cloud" />
                  <button
                    onClick={() => void cacheAlbum(a.key)}
                    className="font-mono mt-1 flex items-center gap-1 text-[9px] tracking-[0.2em] text-dim hover:text-accent"
                  >
                    <CloudDownload className="h-3 w-3" />
                    {caching === a.name ? "CACHING…" : "CACHE OFFLINE"}
                  </button>
                </div>
              ))}
            </MediaRow>
            {status === "ready" && cloudTracks.length === 0 && null}
          </>
        ) : status === "ready" ? (
          <div className="py-14 text-center text-sm text-dim">
            Cloud bucket is empty: hit <span style={{ color: "var(--ato-accent)" }}>SYNC LIBRARY UP</span> to upload.
          </div>
        ) : null}
      </div>

      {/* fixed-height streaming table: kept low so the albums row above
          isn't clipped mid-card (the scrollbar there is easy to miss) */}
      {status === "ready" && cloudTracks.length > 0 && (
        <div className="mt-4 flex h-[30vh] shrink-0 flex-col pt-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-sm font-bold tracking-[0.25em]">ALL CLOUD TRACKS</h2>
                <span className="font-jp text-[10px] tracking-[0.3em] text-dim">ストリーミング</span>
              </div>
              <span className="h-px w-6 shrink-0" style={{ background: "var(--ato-border)" }} />
              <label
                className="clip-tag flex min-w-0 max-w-[280px] flex-1 items-center gap-2 px-3 py-1.5"
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
            <button
              onClick={() => {
                fx.impact(1);
                playQueue(visibleTracks, 0);
              }}
              className="clip-tag font-mono shrink-0 px-4 py-1.5 text-[9px] tracking-[0.3em] text-dim hover:text-accent"
              style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)" }}
            >
              ▶ STREAM EVERYTHING
            </button>
          </div>
          <VirtualTrackList tracks={visibleTracks} showAlbum className="min-h-0 flex-1" />
        </div>
      )}
    </div>
  );
}

/** One cloud playlist row: click to play, right-click for its own menu
 *  (play/queue, inline rename, delete with confirm). */
function CloudPlaylistRow({
  playlist,
  cloudTracks,
  onPlay,
  onRemove,
}: {
  playlist: CloudPlaylist;
  cloudTracks: TrackMeta[];
  onPlay: () => void;
  onRemove: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(playlist.name);
  // mirrors of local playlists are read-only here: the LOCAL section owns
  // their name and members (and re-pushes them on every local change)
  const mirror = isLocalMirror(playlist);

  const members = playlist.trackKeys
    .map((k) => cloudTracks.find((t) => t.path === k))
    .filter((t): t is TrackMeta => Boolean(t));

  const commitRename = () => {
    if (draft.trim() && draft !== playlist.name) useCloudPlaylists.getState().rename(playlist.id, draft);
    setRenaming(false);
  };

  const deleteWithConfirm = () => {
    void (async () => {
      if (!(await confirm({ title: `DELETE ${playlist.name}?`, body: "The cloud playlist is removed for this account.", danger: true }))) return;
      onRemove();
    })();
  };

  const openMenu = (e: { preventDefault(): void; stopPropagation(): void; clientX: number; clientY: number }) => {
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
                toast(`Next: ${members.length} from ${playlist.name}`, "info", "次に再生");
              },
            },
            {
              label: "Add to queue",
              jp: "キューに追加",
              run: () => {
                for (const t of members) addToQueue(t);
                toast(`Queued ${playlist.name}`, "info", "キューに追加");
              },
            },
          ]
        : []),
      ...(mirror
        ? []
        : [
            { divider: true, label: "" },
            {
              label: "Rename playlist",
              jp: "改名",
              run: () => {
                setDraft(playlist.name);
                setRenaming(true);
              },
            },
            { label: "Delete playlist", jp: "削除", danger: true, run: deleteWithConfirm },
          ]),
    ];
    showContextMenu(e, items);
  };

  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5"
      style={{ borderBottom: "1px solid var(--ato-border)" }}
      onContextMenu={openMenu}
    >
      <ListMusic className="h-4 w-4 shrink-0 text-dim" />
      {renaming ? (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitRename()}
            className="font-mono min-w-0 flex-1 bg-transparent px-2 py-1 text-xs outline-none"
            style={{ border: "1px solid var(--ato-border)" }}
          />
          <button
            onClick={commitRename}
            className="clip-tag p-1"
            style={{ background: "color-mix(in srgb, var(--ato-accent) 14%, transparent)", color: "var(--ato-accent)" }}
            aria-label="Save name"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onClick={() => setRenaming(false)}
            className="clip-tag p-1"
            style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)", color: "var(--ato-text-dim)" }}
            aria-label="Cancel rename"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <button onClick={onPlay} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-medium group-hover:text-accent">
            {playlist.name}
            {mirror && (
              <span
                className="font-mono ml-2 align-middle text-[8px] tracking-[0.25em]"
                style={{ color: "var(--ato-accent-2)" }}
              >
                SYNC
              </span>
            )}
          </span>
          <span className="font-mono block text-[10px] text-dim">{playlist.trackKeys.length} TRACKS</span>
        </button>
      )}
      {!mirror && (
        <button
          onClick={deleteWithConfirm}
          className="p-1 text-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
          aria-label={`Delete ${playlist.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
