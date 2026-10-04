import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  catalogueReady,
  deleteCatalogueTracks,
  fetchCataloguePlaylists,
  putCataloguePlaylists,
  putCataloguePlaylistPic,
  isAdminUser,
  CloudAuthError,
  type CataloguePlaylist,
} from "./cloudService";
import { useAuth } from "@/core/auth/authStore";
import { toast } from "@/state/toastStore";

/**
 * CataloguePlaylistStore: the shared catalogue's admin-curated playlists.
 * Every signed-in account reads them; only an admin's device mutates (the
 * server rejects non-admin writes anyway, so the guard keeps the local
 * optimistic state honest). Track references are absolute catalogue/… keys.
 */

interface CataloguePlaylistState {
  playlists: CataloguePlaylist[];
  pull: () => Promise<void>;
  create: (name: string) => CataloguePlaylist | null;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  addTrack: (id: string, trackKey: string) => void;
  removeTrack: (id: string, trackKey: string) => void;
  /** custom cover: cropped blob uploads to the catalogue namespace first */
  setPic: (id: string, blob: Blob | null) => Promise<void>;
  clear: () => void; // sign-out / server switch
}

function newId(): string {
  return `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useCataloguePlaylists = create<CataloguePlaylistState>()(
  persist(
    (set, get) => {
      /** apply a mutation locally, then push the full list to the server */
      const mutate = (fn: (cur: CataloguePlaylist[]) => CataloguePlaylist[]) => {
        if (!isAdminUser()) return;
        const next = fn(get().playlists);
        set({ playlists: next });
        void putCataloguePlaylists(next).catch(() => {});
      };
      return {
        playlists: [],
        pull: async () => {
          if (!catalogueReady()) return;
          try {
            const playlists = await fetchCataloguePlaylists();
            set({ playlists });
          } catch (e) {
            if (e instanceof CloudAuthError) useAuth.getState().setSessionExpired(true);
          }
        },
        create: (name) => {
          const trimmed = name.trim();
          if (!trimmed || !isAdminUser()) return null;
          const p: CataloguePlaylist = {
            id: newId(),
            name: trimmed.slice(0, 80),
            trackKeys: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
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
        setPic: async (id, blob) => {
          if (!isAdminUser()) return;
          const previous = get().playlists.find((p) => p.id === id)?.picKey ?? null;
          try {
            const key = blob ? await putCataloguePlaylistPic(id, blob) : null;
            mutate((cur) => cur.map((p) => (p.id === id ? { ...p, picKey: key, updatedAt: Date.now() } : p)));
            // the superseded cover object is garbage once nothing references it
            if (previous && previous !== key) void deleteCatalogueTracks([previous]).catch(() => {});
            toast(blob ? "Playlist picture updated" : "Playlist picture removed", "success", "カバー更新");
          } catch {
            toast("Playlist picture upload failed", "error", "カバー失敗");
          }
        },
        clear: () => set({ playlists: [] }),
      };
    },
    { name: "atori-cat-playlists", partialize: (s) => ({ playlists: s.playlists }) },
  ),
);
