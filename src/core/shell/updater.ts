import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { inTauriShell } from "@/core/library/shellIngest";
import { toast } from "@/state/toastStore";

/**
 * Auto-updater (desktop shell only). One passive check per launch; when an
 * update exists it downloads and installs immediately, then relaunches.
 * Failures are silent — the app keeps working on whatever version it has.
 */

let checked = false;

export async function checkForUpdates(): Promise<void> {
  if (!inTauriShell() || checked) return;
  checked = true;
  try {
    const update: Update | null = await check();
    if (!update) return;
    toast(`Updating to v${update.version}…`, "info", "アップデート");
    await update.downloadAndInstall();
    await relaunch();
  } catch {
    // update checks must never disturb playback
  }
}
