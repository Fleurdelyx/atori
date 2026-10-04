import { create } from "zustand";
import { syncLibraryUp, resolveSourceFile, type SyncProgress } from "./cloudService";
import { db } from "@/core/library/db";
import { cloudConfigured } from "./cloudService";
import { toast } from "@/state/toastStore";
import type { TrackMeta } from "@/core/library/types";

/**
 * Library sync state — GLOBAL, unlike the Cloud screen that launches it:
 * navigating away mid-sync keeps the upload running and the progress bar
 * attached wherever you land back on the Cloud tab.
 */
interface SyncState {
  syncing: SyncProgress | null;
  result: string | null;
  /** target "catalogue" publishes to the shared catalogue; an explicit track
   *  list (e.g. from the upload picker) overrides the whole local library */
  start: (target?: "user" | "catalogue", tracks?: TrackMeta[]) => Promise<void>;
  clearResult: () => void;
}

export const useSync = create<SyncState>()((set, get) => ({
  syncing: null,
  result: null,
  start: async (target: "user" | "catalogue" = "user", tracks?: TrackMeta[]) => {
    if (get().syncing) return; // one sync at a time
    if (!cloudConfigured()) {
      set({ result: "CLOUD NOT CONFIGURED: SETTINGS → CLOUD" });
      return;
    }
    const local = tracks ?? (await db.tracks.toArray());
    if (local.length === 0) {
      set({ result: "LOCAL LIBRARY EMPTY: IMPORT FIRST" });
      return;
    }
    set({ result: null, syncing: { done: 0, total: local.length, current: "" } });
    try {
      const r = await syncLibraryUp(
        local,
        (t) => resolveSourceFile(t),
        (p) => set({ syncing: p }),
        async (coverKey) => (await db.covers.get(coverKey))?.blob ?? null,
        target,
      );
      // degraded-sync suffixes: a skipped dedupe explains a surprising "N NEW",
      // a skipped listing write means the upload is incomplete until retried
      const notes =
        (r.dedupeOk ? "" : " · SERVER LIST UNREACHABLE: NOT DEDUPED") +
        (r.manifestWritten ? "" : " · LISTING NOT UPDATED");
      set({
        result:
          (target === "catalogue"
            ? `CATALOGUE SYNCED ${r.uploaded} NEW · ${r.skipped} ALREADY THERE${r.failed ? `: ${r.failed} FAILED` : ""}`
            : `SYNCED ${r.uploaded} NEW · ${r.skipped} ALREADY IN CLOUD${r.failed ? `: ${r.failed} FAILED` : ""}`) + notes,
      });
      const degraded = !r.dedupeOk || !r.manifestWritten;
      toast(
        r.failed > 0
          ? target === "catalogue"
            ? `Catalogue sync finished: ${r.uploaded} uploaded, ${r.failed} failed`
            : `Sync finished: ${r.uploaded} uploaded, ${r.failed} failed`
          : !r.manifestWritten && r.uploaded > 0
            ? "Uploaded, but the cloud list is unreachable: retry the sync"
            : r.uploaded === 0
              ? target === "catalogue"
                ? `Catalogue already up to date (${r.skipped} tracks)`
                : `Everything already in the cloud (${r.skipped} tracks)`
              : target === "catalogue"
                ? `Catalogue updated: ${r.uploaded} uploaded, ${r.skipped} already there`
                : `Sync complete: ${r.uploaded} uploaded, ${r.skipped} already there`,
        r.failed > 0 || (!r.manifestWritten && r.uploaded > 0) ? "error" : degraded ? "info" : "success",
        target === "catalogue" ? "カタログ同期" : "同期完了",
      );
      const { useCloud } = await import("./cloudStore");
      await useCloud.getState().refresh();
      if (target === "catalogue") {
        const { useCatalogue } = await import("./catalogueStore");
        await useCatalogue.getState().refresh();
      }
    } catch (e) {
      set({ result: `SYNC FAILED: ${String(e).slice(0, 60)}` });
      toast("Library sync failed", "error", "同期失敗");
    }
    set({ syncing: null });
  },
  clearResult: () => set({ result: null }),
}));
