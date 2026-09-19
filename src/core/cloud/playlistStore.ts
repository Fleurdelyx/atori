import { create } from "zustand";
import { persist } from "zustand/middleware";
import { accountActive, fetchPlaylists, putPlaylists, type CloudPlaylist } from "@/core/cloud/accountService";
import { CloudAuthError } from "./cloudService";
import { useAuth } from "@/core/auth/authStore";

/**
 * PlaylistStore — cloud playlists synced to the account. Track references are
 * R2 object keys (cloud tracks). Local (Dexie) playlists are a separate
 * concept and never merge with these.
 */

interface PlaylistState {
  playlists: CloudPlaylist[];
  /** server → local (on sign-in / CloudScreen mount) */
  pull: () => Promise<void>;
  create: (name: string) => CloudPlaylist | null;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  addTrack: (id: string, trackKey: string) => void;
  removeTrack: (id: string, trackKey: string) => void;
  clear: () => void; // sign-out
}

function newId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useCloudPlaylists = create<PlaylistState>()(
  persist(
    (set, get) => {
      /** apply a mutation locally, then best-effort push the full list */
      const mutate = (fn: (cur: CloudPlaylist[]) => CloudPlaylist[]) => {
        const next = fn(get().playlists);
        set({ playlists: next });
        if (accountActive()) void putPlaylists(next).catch(() => {});
      };
      return {
        playlists: [],
        pull: async () => {
          if (!accountActive()) return;
          try {
            const playlists = await fetchPlaylists();
            set({ playlists });
          } catch (e) {
            if (e instanceof CloudAuthError) useAuth.getState().setSessionExpired(true);
          }
        },
        create: (name) => {
          const trimmed = name.trim();
          if (!trimmed) return null;
          const p: CloudPlaylist = { id: newId(), name: trimmed.slice(0, 80), trackKeys: [], updatedAt: Date.now() };
          mutate((cur) => [...cur, p]);
          return p;
        },
        remove: (id) => mutate((cur) => cur.filter((p) => p.id !== id)),
        rename: (id, name) =>
          mutate((cur) => cur.map((p) => (p.id === id ? { ...p, name: name.slice(0, 80), updatedAt: Date.now() } : p))),
        addTrack: (id, trackKey) =>
          mutate((cur) =>
            cur.map((p) =>
              p.id === id && !p.trackKeys.includes(trackKey)
                ? { ...p, trackKeys: [...p.trackKeys, trackKey], updatedAt: Date.now() }
                : p,
            ),
          ),
        removeTrack: (id, trackKey) =>
          mutate((cur) =>
            cur.map((p) => (p.id === id ? { ...p, trackKeys: p.trackKeys.filter((k) => k !== trackKey), updatedAt: Date.now() } : p)),
          ),
        clear: () => set({ playlists: [] }),
      };
    },
    { name: "atori-playlists", partialize: (s) => ({ playlists: s.playlists }) },
  ),
);
