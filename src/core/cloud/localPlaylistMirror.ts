import { liveQuery } from "dexie";
import { db, type Playlist } from "@/core/library/db";
import type { TrackMeta } from "@/core/library/types";import { accountActive, putPlaylists, type CloudPlaylist } from "./accountService";
import { manifestToTracks } from "./cloudService";
import { useCloud } from "./cloudStore";
import { useCloudPlaylists } from "./playlistStore";
import { useAuth } from "@/core/auth/authStore";

/**
 * LocalPlaylistMirror: local (Dexie) playlists sync to the account so they
 * exist on every signed-in device. One mirror CloudPlaylist per local
 * playlist; members resolve to cloud object keys by song identity and
 * unresolvable tracks are skipped (they couldn't stream from the cloud
 * anyway). Mirror ids carry the owning install's origin (`lp_<origin>-<id>`),
 * so a device only ever prunes its own orphans and never another device's
 * mirrors. The local copy stays the source of truth: cloud-side edits to a
 * mirrored entry are overwritten by the next local change.
 */

const MIRROR_PREFIX = "lp_";

export function isLocalMirror(p: { id: string }): boolean {
  return p.id.startsWith(MIRROR_PREFIX);
}

function installOrigin(): string {
  let o = localStorage.getItem("atori-origin");
  if (!o) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    o = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 6);
    localStorage.setItem("atori-origin", o);
  }
  return o;
}

/** this install's mirror namespace: UI hides a device's own mirrors (the
 *  LOCAL section already shows those playlists) and shows foreign ones */
export function getInstallOrigin(): string {
  return installOrigin();
}

function sameSong(a: TrackMeta, b: TrackMeta): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    norm(a.title) === norm(b.title) &&
    norm(a.artist) === norm(b.artist) &&
    Math.abs((a.duration ?? 0) - (b.duration ?? 0)) <= 3
  );
}

/** Pure: the account playlist list with one mirror per local playlist, or
 *  null when nothing changed (skip the network push). */
export function buildMirroredList(
  local: Playlist[],
  localTracks: TrackMeta[],
  current: CloudPlaylist[],
  cloudTracks: TrackMeta[],
  origin: string,
): CloudPlaylist[] | null {
  const mine = `${MIRROR_PREFIX}${origin}-`;
  const localIds = new Set(local.map((p) => p.id));
  // keep user-created playlists, other devices' mirrors, and this device's
  // still-alive mirrors; drop mirrors whose local playlist was deleted here
  const kept = current.filter((p) => !p.id.startsWith(mine) || localIds.has(Number(p.id.slice(mine.length))));
  const byLocalId = new Map(localTracks.map((t) => [t.id, t]));
  const out = [...kept];
  for (const pl of local) {
    const id = `${mine}${pl.id}`;
    const existing = out.find((p) => p.id === id);
    const trackKeys: string[] = [];
    for (const tid of pl.trackIds) {
      const t = byLocalId.get(tid);
      if (!t) continue;
      const hit = cloudTracks.find((c) => sameSong(t, c));
      if (hit) trackKeys.push(hit.path);
    }
    const entry: CloudPlaylist = {
      id,
      name: pl.name.slice(0, 80),
      trackKeys: trackKeys.slice(0, 2000),
      updatedAt: existing?.updatedAt ?? pl.createdAt,
    };
    const at = out.findIndex((p) => p.id === id);
    if (at >= 0) out[at] = entry;
    else out.push(entry);
  }
  const same =
    out.length === current.length &&
    out.every((p, i) => p.id === current[i].id && p.name === current[i].name && p.updatedAt === current[i].updatedAt && p.trackKeys.length === current[i].trackKeys.length && p.trackKeys.every((k, j) => k === current[i].trackKeys[j]));
  return same ? null : out;
}

let debounce: number | null = null;
let latestLocal: Playlist[] = [];
let latestTracks: TrackMeta[] = [];

function scheduleSync(origin: string) {
  if (debounce != null) window.clearTimeout(debounce);
  debounce = window.setTimeout(async () => {
    debounce = null;
    if (!accountActive()) return;
    try {
      const manifest = useCloud.getState().manifest;
      const cloudTracks = manifest ? manifestToTracks(manifest) : [];
      const store = useCloudPlaylists.getState();
      const next = buildMirroredList(latestLocal, latestTracks, store.playlists, cloudTracks, origin);
      if (!next) return;
      useCloudPlaylists.setState({ playlists: next });
      await putPlaylists(next);
    } catch (e) {
      if ((e as { name?: string })?.name === "CloudAuthError") useAuth.getState().setSessionExpired(true);
      // best-effort: the next local change re-pushes
    }
  }, 1500);
}

/** Wire the mirror: Dexie live queries + manifest refreshes feed a debounced
 *  compose-and-push. Called once at boot. */
export function installLocalPlaylistMirror() {
  const origin = installOrigin();
  liveQuery(() => db.playlists.toArray()).subscribe({
    next: (v) => {
      latestLocal = v;
      scheduleSync(origin);
    },
    error: (e) => console.warn("playlist mirror", e),
  });
  liveQuery(() => db.tracks.toArray()).subscribe({
    next: (v) => {
      latestTracks = v;
      scheduleSync(origin);
    },
    error: (e) => console.warn("playlist mirror tracks", e),
  });
  // fresh uploads create cloud twins, so members re-resolve after a sync
  useCloud.subscribe((s) => {
    if (s.manifest) scheduleSync(origin);
  });
}
