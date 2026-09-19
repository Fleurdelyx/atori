import { create } from "zustand";
import {
  cachedTrackUrl,
  cloudConfigured,
  CloudAuthError,
  fetchManifest,
  streamUrlFor,
  type CloudManifest,
} from "./cloudService";
import { engine } from "@/core/audio/AudioEngine";
import { useAuth } from "@/core/auth/authStore";
import { toast } from "@/state/toastStore";

interface CloudState {
  manifest: CloudManifest | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  refresh: () => Promise<void>;
}

/** Cloud library state + the engine's remote-source resolver. */
export const useCloud = create<CloudState>()((set) => ({
  manifest: null,
  status: "idle",
  error: null,
  refresh: async () => {
    if (!cloudConfigured()) {
      set({ status: "idle", manifest: null, error: null });
      return;
    }
    set({ status: "loading", error: null });
    try {
      const manifest = await fetchManifest();
      set({ manifest, status: "ready" });
    } catch (e) {
      if (e instanceof CloudAuthError) {
        useAuth.getState().setSessionExpired(true);
        set({ status: "error", error: "Session expired — sign in again" });
        return;
      }
      set({ status: "error", error: String(e).slice(0, 120) });
    }
  },
}));

let wired = false;

/**
 * Engine resolver: cached blob → stream URL. Also auto-caches after load.
 * A cloud stream that fails to load marks the session expired when the
 * account's token is stale (instead of silently skipping the queue).
 */
export function wireCloud() {
  if (wired) return;
  wired = true;

  engine.urlResolver = async (track) => {
    if (track.source !== "cloud") return null;
    const cached = await cachedTrackUrl(track.path);
    if (cached) return cached;
    if (!cloudConfigured()) return null;
    return streamUrlFor(track.path);
  };

  engine.onCloudStreamError = () => {
    // probe the session once — audio errors can also be codec/bad-file issues
    void (async () => {
      const auth = useAuth.getState();
      if (!auth.sessionToken || !auth.serverUrl) return;
      const { me } = await import("@/core/auth/authService");
      const user = await me(auth.serverUrl, auth.sessionToken);
      if (!user) {
        useAuth.getState().setSessionExpired(true);
        useAuth.getState().setAuthOpen(true);
        toast("Session expired — sign in again", "error", "セッション切れ");
      }
    })();
  };
}
