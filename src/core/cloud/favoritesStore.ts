import { create } from "zustand";
import { persist } from "zustand/middleware";
import { accountActive, fetchFavorites, putFavorites } from "@/core/cloud/accountService";
import { CloudAuthError } from "./cloudService";
import { useAuth } from "@/core/auth/authStore";

/**
 * FavoritesStore — "saved" cloud track keys. Local mirror persisted in
 * localStorage; pushed/pulled to the account when signed in (last-write-wins
 * full-list sync — the list is small by design).
 */

interface FavoritesState {
  keys: string[];
  /** server → local (on sign-in / CloudScreen mount) */
  pull: () => Promise<void>;
  toggle: (key: string) => void;
  isSaved: (key: string) => boolean;
  /** sign-out */
  clear: () => void;
}

export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      keys: [],
      pull: async () => {
        if (!accountActive()) return;
        try {
          const keys = await fetchFavorites();
          set({ keys });
        } catch (e) {
          if (e instanceof CloudAuthError) useAuth.getState().setSessionExpired(true);
        }
      },
      toggle: (key) => {
        const cur = get().keys;
        const keys = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
        set({ keys });
        if (accountActive()) void putFavorites(keys).catch(() => {});
      },
      isSaved: (key) => get().keys.includes(key),
      clear: () => set({ keys: [] }),
    }),
    { name: "atori-favs", partialize: (s) => ({ keys: s.keys }) },
  ),
);
