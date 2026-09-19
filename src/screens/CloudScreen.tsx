import { useEffect, useState } from "react";
import { CloudDownload, CloudUpload, Heart, ListMusic, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { useCloud } from "@/core/cloud/cloudStore";
import {
  cloudConfigured,
  CloudAuthError,
  manifestToTracks,
  syncLibraryUp,
  testConnection,
  cacheTrack,
  type SyncProgress,
} from "@/core/cloud/cloudService";
import { accountActive, type CloudPlaylist } from "@/core/cloud/accountService";
import { useFavorites } from "@/core/cloud/favoritesStore";
import { useCloudPlaylists } from "@/core/cloud/playlistStore";
import { useAuth } from "@/core/auth/authStore";
import { db } from "@/core/library/db";
import { groupAlbums } from "@/core/library/useLibrary";
import { usePlayback } from "@/core/audio/playbackStore";
import { useUi } from "@/state/uiStore";
import { fx } from "@/fx/FxDirector";
import { toast } from "@/state/toastStore";
import type { TrackMeta } from "@/core/library/types";
import { AlbumCard, MediaRow } from "@/ui/components";
import { VirtualTrackList } from "@/ui/kit/VirtualTrackList";

/**
 * CloudScreen — browse + play the R2-backed library.
 * Streams through the atori-cloud worker; per-album offline caching.
 */
export function CloudScreen() {
  const { manifest, status, error, refresh } = useCloud();
  const cloudUrl = useUi((s) => s.cloudUrl);
  const [syncing, setSyncing] = useState<SyncProgress | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [caching, setCaching] = useState<string | null>(null);
  const [newPlName, setNewPlName] = useState("");
  const playQueue = usePlayback((s) => s.playQueue);
  const favKeys = useFavorites((s) => s.keys);
  const toggleSaved = useFavorites((s) => s.toggle);
  const playlists = useCloudPlaylists((s) => s.playlists);
  const plCreate = useCloudPlaylists((s) => s.create);
  const plRemove = useCloudPlaylists((s) => s.remove);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    if (cloudConfigured() && status === "idle") void refresh();
  }, [status, refresh]);

  // pull account favorites + playlists when signed in
  useEffect(() => {
    if (accountActive()) {
      void useFavorites.getState().pull();
      void useCloudPlaylists.getState().pull();
    }
  }, [user?.id]);

  const cloudTracks = manifest ? manifestToTracks(manifest) : [];
  const albums = groupAlbums(cloudTracks);
  const savedTracks = cloudTracks.filter((t) => favKeys.includes(t.path));

  function playTracks(list: TrackMeta[], start = 0) {
    if (list.length === 0) {
      toast("Nothing to play here yet — add some tracks", "info", "再生なし");
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
    setSyncResult(null);
    if (!cloudConfigured()) {
      setSyncResult("CLOUD NOT CONFIGURED — SETTINGS → CLOUD");
      return;
    }
    const local = await db.tracks.toArray();
    if (local.length === 0) {
      setSyncResult("LOCAL LIBRARY EMPTY — IMPORT FIRST");
      return;
    }
    setSyncing({ done: 0, total: local.length, current: "" });
    try {
      const r = await syncLibraryUp(
        local,
        async (t) => {
          const src = await db.sources.get(t.path);
          if (!src) return null;
          if (src.handle) {
            const h = src.handle as FileSystemFileHandle & {
              queryPermission?: (d: { mode: string }) => Promise<PermissionState>;
            };
            try {
              const state = (await h.queryPermission?.({ mode: "read" })) ?? "granted";
              if (state !== "granted" && src.file) return src.file;
              if (state === "granted") return await src.handle.getFile();
            } catch {
              /* fall through */
            }
          }
          return src.file ?? null;
        },
        setSyncing,
        async (coverKey) => (await db.covers.get(coverKey))?.blob ?? null,
      );
      setSyncResult(`SYNCED ${r.uploaded} TRACKS${r.failed ? ` — ${r.failed} FAILED` : ""}`);
      await refresh();
    } catch (e) {
      setSyncResult(`SYNC FAILED — ${String(e).slice(0, 60)}`);
    }
    setSyncing(null);
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
        toast("Session expired — sign in again", "error", "セッション切れ");
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
          <div className="font-mono text-[10px] tracking-[0.35em] text-dim">PHASE 5 // CLOUDFLARE R2</div>
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
            </button>{" "}
            — then sync your local library up and stream it anywhere.
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
                <div
                  key={p.id}
                  className="group flex items-center gap-3 px-3 py-2.5"
                  style={{ borderBottom: "1px solid var(--ato-border)" }}
                >
                  <ListMusic className="h-4 w-4 shrink-0 text-dim" />
                  <button onClick={() => playPlaylist(p)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13px] font-medium group-hover:text-accent">{p.name}</span>
                    <span className="font-mono block text-[10px] text-dim">{p.trackKeys.length} TRACKS</span>
                  </button>
                  <button
                    onClick={() => plRemove(p.id)}
                    className="p-1 text-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {playlists.length === 0 && (
                <div className="font-mono py-3 text-[10px] tracking-[0.15em] text-dim">
                  NO CLOUD PLAYLISTS — CREATE ONE, THEN RIGHT-CLICK A CLOUD TRACK TO ADD IT.
                </div>
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
            Cloud bucket is empty — hit <span style={{ color: "var(--ato-accent)" }}>SYNC LIBRARY UP</span> to upload.
          </div>
        ) : null}
      </div>

      {/* fixed-height streaming table */}
      {status === "ready" && cloudTracks.length > 0 && (
        <div className="flex h-[42vh] shrink-0 flex-col pt-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-sm font-bold tracking-[0.25em]">ALL CLOUD TRACKS</h2>
              <span className="font-jp text-[10px] tracking-[0.3em] text-dim">ストリーミング</span>
              <span className="h-px flex-1" style={{ background: "var(--ato-border)" }} />
            </div>
            <button
              onClick={() => {
                fx.impact(1);
                playQueue(cloudTracks, 0);
              }}
              className="clip-tag font-mono px-4 py-1.5 text-[9px] tracking-[0.3em] text-dim hover:text-accent"
              style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)" }}
            >
              ▶ STREAM EVERYTHING
            </button>
          </div>
          <VirtualTrackList tracks={cloudTracks} showAlbum className="min-h-0 flex-1" />
        </div>
      )}
    </div>
  );
}
