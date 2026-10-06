import { create } from "zustand";
import { catalogueReady, fetchCatalogueManifest, isCached, CloudAuthError, type CloudManifest } from "./cloudService";

interface CatalogueState {
  manifest: CloudManifest | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * The server's shared catalogue: admin-curated tracks every signed-in
 * account can browse, search and stream. Refreshed at boot, after sign-in,
 * on server switch and after catalogue syncs. A failed pull keeps the last
 * manifest on screen but flags it: an empty-looking CATALOGUE scope with a
 * healthy server is exactly the bug a silent catch used to hide.
 */
export const useCatalogue = create<CatalogueState>()((set) => ({
  manifest: null,
  status: "idle",
  error: null,
  refresh: async () => {
    if (!catalogueReady()) {
      set({ manifest: null, status: "idle", error: null });
      return;
    }
    set({ status: "loading", error: null });
    try {
      const manifest = await fetchCatalogueManifest();
      set({ manifest, status: "ready" });
      void useCatalogueCached.getState().refresh();
    } catch (e) {
      const error =
        e instanceof CloudAuthError ? "Session expired: sign in again" : `Catalogue unreachable: ${String(e).slice(0, 80)}`;
      set({ status: "error", error });
    }
  },
}));

interface CatalogueCachedState {
  /** catalogue track paths present in this device's offline cache */
  paths: Set<string>;
  refresh: () => Promise<void>;
}

/**
 * Which catalogue songs this device has downloaded. The merged library only
 * surfaces shared-catalogue songs that are downloaded or liked (it is the
 * server's shelf, not the user's), and this set is the "downloaded" half of
 * that gate. Rescanned whenever the catalogue manifest changes or a
 * catalogue download lands.
 */
export const useCatalogueCached = create<CatalogueCachedState>()((set) => ({
  paths: new Set<string>(),
  refresh: async () => {
    const manifest = useCatalogue.getState().manifest;
    const keys = manifest?.tracks.map((t) => t.key) ?? [];
    const paths = new Set<string>();
    for (const key of keys) {
      if (await isCached(key)) paths.add(key);
    }
    set({ paths });
  },
}));
