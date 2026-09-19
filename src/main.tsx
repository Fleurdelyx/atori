import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import { wireEngine } from "@/core/library/importService";
import { wireCloud } from "@/core/cloud/cloudStore";
import { primePlaylistCache } from "@/core/library/playlists";
import { engine } from "@/core/audio/AudioEngine";
import { usePlayback, saveLastTrack, setCloudResumePush, readQueueState, saveQueueNow } from "@/core/audio/playbackStore";
import { fetchResume, putResume, type ResumeState } from "@/core/cloud/cloudService";
import { checkForUpdates } from "@/core/shell/updater";
import { useUi } from "@/state/uiStore";
import type { TrackMeta } from "@/core/library/types";

// Library + cloud ↔ engine wiring (file, cover and remote-source resolvers)
wireEngine();
wireCloud();
primePlaylistCache();

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

// Restore persisted volume + last played track (paused — autoplay is blocked anyway)
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
  const local = readLocalResume();
  // race the cloud snapshot (3s cap) so the boot animation covers the wait
  const cloud = await Promise.race([
    fetchResume().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
  const savedQueue = readQueueState();
  const candidates: { entry: ResumeEntry; queue?: { queue: TrackMeta[]; index: number } }[] = [
    cloud ? { entry: cloud } : null,
    savedQueue
      ? {
          entry: {
            track: savedQueue.queue[Math.min(savedQueue.index, savedQueue.queue.length - 1)],
            pos: savedQueue.pos,
            savedAt: savedQueue.savedAt,
          },
          queue: { queue: savedQueue.queue, index: savedQueue.index },
        }
      : null,
    local ? { entry: local } : null,
  ].filter((c): c is { entry: ResumeEntry; queue?: { queue: TrackMeta[]; index: number } } => !!c?.entry.track);
  candidates.sort((a, b) => b.entry.savedAt - a.entry.savedAt);
  for (const { entry, queue } of candidates) {
    const usable = await usableHere(entry);
    if (!usable) continue;
    if (queue && queue.queue[queue.index]?.id === usable.track.id) {
      engine.restoreQueue(queue.queue, queue.index, entry.pos);
    } else {
      engine.restoreTrack(usable.track, entry.pos);
    }
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
    return null; // corrupted value — skip restore
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

// PWA — installable + offline app shell (browser prod only; never in Tauri,
// where the shell serves via its own protocol, and never in dev HMR)
if (
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  !("__TAURI_INTERNALS__" in window)
) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // offline shell is a progressive enhancement — ignore failures
    });
  });
}

// Desktop shell auto-updater — one passive check per launch (no-op in browser)
window.addEventListener("load", () => {
  void checkForUpdates();
});

createRoot(document.getElementById("root")!).render(<App />);
