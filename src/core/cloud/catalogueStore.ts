import { create } from "zustand";
import { catalogueReady, fetchCatalogueManifest, CloudAuthError, type CloudManifest } from "./cloudService";

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
    } catch (e) {
      const error =
        e instanceof CloudAuthError ? "Session expired: sign in again" : `Catalogue unreachable: ${String(e).slice(0, 80)}`;
      set({ status: "error", error });
    }
  },
}));
