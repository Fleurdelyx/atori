import { create } from "zustand";
import { accountActive, fetchPlayStats, putPlayStats, type PlayStatEntry } from "./accountService";
import { CloudAuthError } from "./cloudService";
import { useAuth } from "@/core/auth/authStore";

/**
 * PlayStatsStore: the account's listening log, keyed by track path. Pulled
 * on sign-in / server switch, pushed (debounced, fire-and-forget) whenever
 * the engine logs a play. The local Dexie play log stays the per-device
 * record; this store merges with it in useWrapped so stats reflect every
 * device signed into the account.
 */

interface PlayStatsState {
  plays: PlayStatEntry[];
  pull: () => Promise<void>;
  push: (entry: PlayStatEntry) => void;
  clear: () => void; // sign-out
}

const MAX_LOG = 5000;
let timer: number | null = null;
let pending: PlayStatEntry[] = [];

export const usePlayStats = create<PlayStatsState>()((set, get) => ({
  plays: [],
  pull: async () => {
    if (!accountActive()) return;
    try {
      const plays = await fetchPlayStats();
      set({ plays });
    } catch (e) {
      if (e instanceof CloudAuthError) useAuth.getState().setSessionExpired(true);
    }
  },
  push: (entry) => {
    pending.push(entry);
    if (timer != null) return;
    timer = window.setTimeout(async () => {
      timer = null;
      const batch = pending;
      pending = [];
      if (!accountActive()) return;
      try {
        // read-merge-write like favorites: last write wins, log capped newest-first
        const cur = await fetchPlayStats();
        const seen = new Set(cur.map((p) => `${p.path}@${p.at}`));
        const local = get()
          .plays.filter((p) => !seen.has(`${p.path}@${p.at}`))
          .map((p) => p);
        const merged = [...batch, ...cur, ...local]
          .filter((p, i, arr) => arr.findIndex((q) => q.path === p.path && q.at === p.at) === i)
          .sort((a, b) => b.at - a.at)
          .slice(0, MAX_LOG);
        set({ plays: merged });
        await putPlayStats(merged);
      } catch (e) {
        if (e instanceof CloudAuthError) useAuth.getState().setSessionExpired(true);
        // stats are best-effort: a failed push drops the batch silently
      }
    }, 4000);
  },
  clear: () => {
    pending = [];
    set({ plays: [] });
  },
}));
