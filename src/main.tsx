import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import { wireEngine } from "@/core/library/importService";
import { wireCloud } from "@/core/cloud/cloudStore";
import { primePlaylistCache } from "@/core/library/playlists";
import { engine } from "@/core/audio/AudioEngine";
import { usePlayback, saveLastTrack, setCloudResumePush, readQueueState, saveQueueNow } from "@/core/audio/playbackStore";
import { fetchResume, putResume, cloudConfigured, type ResumeState } from "@/core/cloud/cloudService";
import { useCloud } from "@/core/cloud/cloudStore";
import { useAuth } from "@/core/auth/authStore";
import { checkForUpdates } from "@/core/shell/updater";
import { useUi } from "@/state/uiStore";
import type { TrackMeta } from "@/core/library/types";

// Library + cloud ↔ engine wiring (file, cover and remote-source resolvers)
wireEngine();
wireCloud();
primePlaylistCache();
void import("@/core/cloud/localPlaylistMirror").then((m) => m.installLocalPlaylistMirror());

// Cloud-first library: pull the manifest at boot so Home/Library/search show
// the streamed library without visiting the Cloud screen first. The shared
// catalogue pulls independently — it works signed out too.
import("@/core/cloud/cloudService").then(({ catalogueReady }) => {
  if (catalogueReady()) {
    void import("@/core/cloud/catalogueStore").then((m) => m.useCatalogue.getState().refresh());
    void import("@/core/cloud/cataloguePlaylistStore").then((m) => m.useCataloguePlaylists.getState().pull());
  }
});
if (cloudConfigured()) {
  void useCloud.getState().refresh();
  // refresh the persisted user so freshly granted flags (catalogue admin)
  // show up without waiting for the next login
  const a = useAuth.getState();
  if (a.sessionToken) {
    void import("@/core/auth/authService").then(({ me }) =>
      me(a.serverUrl, a.sessionToken!).then((u) => {
        if (u) useAuth.getState().setSession(a.sessionToken, u);
      }),
    );
  }
}

// Restore persisted EQ onto the engine (applies on graph creation too)
const ui = useUi.getState();
engine.setEq(ui.eqEnabled, ui.eq);
engine.setFade(ui.fade);
engine.setCrossfadeSeconds(ui.crossfadeSeconds);
engine.autoplayEnabled = ui.autoplay;
engine.setSmartVolume(ui.smartVolume);
engine.setShuffle(localStorage.getItem("atori:shuffle") === "1");
const savedRepeat = localStorage.getItem("atori:repeat");
if (savedRepeat === "all" || savedRepeat === "one") engine.setRepeat(savedRepeat);

// Restore persisted volume + the last playing track: the app reopens paused
// on that song, queued from its start; the old session's queue does not carry
// over. Autoplay is blocked at boot anyway.
const savedVolumeRaw = localStorage.getItem("atori:volume");
if (savedVolumeRaw != null) {
  const savedVolume = Number(savedVolumeRaw);
  if (Number.isFinite(savedVolume)) usePlayback.getState().setVolume(Math.min(1, Math.max(0, savedVolume)));
}
// Cross-device continue-listening: pushes mirror the local save moments
// (pause / track change / tab hidden). putResume no-ops unless signed in.
setCloudResumePush((s) => {
  void putResume(s).catch(() => {});
});

void restoreLastTrack();

interface ResumeEntry {
  track: TrackMeta;
  pos: number;
  savedAt: number;
}

/** Can this device actually play the track? Cloud tracks stream anywhere;
 *  local ones need their library row (path/handle live in this device's db). */
async function usableHere(entry: ResumeEntry): Promise<{ track: TrackMeta; pos: number } | null> {
  const t = entry.track;
  if ((t.source ?? "local") === "cloud") return { track: t, pos: entry.pos };
  const { db } = await import("@/core/library/db");
  const fresh = await db.tracks.get(t.id);
  return fresh ? { track: fresh, pos: entry.pos } : null;
}

async function restoreLastTrack() {
  // if the user already started playing while the cloud snapshot was in
  // flight, never clobber their live queue with the stale saved one
  if (engine.queue.length > 0) return;
  const local = readLocalResume();
  // race the cloud snapshot (3s cap) so the boot animation covers the wait
  const cloud = await Promise.race([
    fetchResume().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
  const savedQueue = readQueueState();
  // only the track identity carries across sessions: the app reopens paused
  // on the last song, queued from its start, with a fresh queue
  const candidates: ResumeEntry[] = [
    cloud,
    savedQueue
      ? {
          track: savedQueue.queue[Math.min(savedQueue.index, savedQueue.queue.length - 1)],
          pos: 0,
          savedAt: savedQueue.savedAt,
        }
      : null,
    local ? { ...local, pos: 0 } : null,
  ]
    .filter((c): c is ResumeEntry => !!c?.track)
    .sort((a, b) => b.savedAt - a.savedAt);
  for (const entry of candidates) {
    if (engine.queue.length > 0) return;
    const usable = await usableHere(entry);
    if (!usable) continue;
    engine.restoreTrack(usable.track, 0);
    return;
  }
}

function readLocalResume(): ResumeEntry | null {
  try {
    const raw = localStorage.getItem("atori:lastTrack");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { track?: TrackMeta; pos?: number; savedAt?: number };
    if (!parsed.track || typeof parsed.track.id !== "number") return null;
    return {
      track: parsed.track,
      pos: typeof parsed.pos === "number" ? parsed.pos : 0,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 1,
    };
  } catch {
    return null; // corrupted value: skip restore
  }
}

// Save the resume position when the tab is hidden or closed mid-playback
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    const s = usePlayback.getState();
    saveLastTrack(s.current, s.position);
    saveQueueNow(s.queue, s.index, s.position);
  }
});

if (import.meta.env.DEV) {
  // Dev-only console/testing hook
  const [{ db }, { audioLevels }] = await Promise.all([
    import("@/core/library/db"),
    import("@/core/audio/AudioLevels"),
  ]);
  (window as unknown as { __atori: unknown }).__atori = { engine, useUi, db, audioLevels };
  if (new URLSearchParams(location.search).has("demo")) {
    void import("@/core/library/demo").then((m) => m.runDemoImport());
  }
}

// PWA: installable + offline app shell (browser prod only; never in Tauri,
// where the shell serves via its own protocol, and never in dev HMR)
if (
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  !("__TAURI_INTERNALS__" in window)
) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // offline shell is a progressive enhancement: ignore failures
    });
  });
}

// Desktop shell auto-updater: one passive check per launch (no-op in browser)
window.addEventListener("load", () => {
  void checkForUpdates();
});

createRoot(document.getElementById("root")!).render(<App />);
