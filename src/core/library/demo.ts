import { importFromFileList } from "./importService";
import { db } from "./db";

/**
 * DEV fixture — `?demo=1` fetches public/demo-library/ and pushes it
 * through the real import pipeline (worker parse → Dexie → covers),
 * so import→library→playback can be exercised without native dialogs.
 */
const DEMO_FILES = [
  "01 - Midnight Drive.wav",
  "02 - Chrome Heart.wav",
  "03 - Afterglow.wav",
  "01 - Parallel Hearts.wav",
  "02 - Signal Bloom.wav",
  "01 - Paper Moon.wav",
  "02 - Constellation of Us.wav",
];

export async function runDemoImport(): Promise<void> {
  const existing = await db.tracks.count();
  if (existing > 0) return; // already imported
  const files: File[] = [];
  for (const name of DEMO_FILES) {
    const res = await fetch(`/demo-library/${encodeURIComponent(name)}`);
    if (!res.ok) {
      console.warn(`demo: fetch failed for ${name}`);
      continue;
    }
    const blob = await res.blob();
    files.push(new File([blob], name, { type: "audio/wav" }));
  }
  const result = await importFromFileList(files);
  console.info("demo import complete", result);
}
