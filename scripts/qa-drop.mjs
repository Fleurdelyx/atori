/**
 * Drag-drop import QA: dispatches a synthetic drop carrying an MP4-named
 * media file at the window level (same listener the shell's HTML5 path uses)
 * and asserts the track lands in the library with hasVideo set.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-drop.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:1431";
const browser = await puppeteer.launch({
  executablePath: process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: await mkdtemp(join(tmpdir(), "atori-drop-")),
  args: ["--no-first-run", "--mute-audio"],
  defaultViewport: { width: 1400, height: 880 },
});
const page = await browser.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));

await page.goto(`${BASE}/?demo`, { waitUntil: "domcontentloaded" });
await sleep(8500);

const r = await page.evaluate(async () => {
  // a tiny animated webm, renamed .mp4: proves extension acceptance + parse
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));
  rec.start();
  const t0 = performance.now();
  await new Promise((resolve) => {
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      ctx.fillStyle = `hsl(${(t * 300) % 360} 90% 55%)`;
      ctx.fillRect(0, 0, 320, 180);
      if (t < 1.5) requestAnimationFrame(draw);
      else resolve();
    };
    draw();
  });
  rec.stop();
  await done;
  const blob = new Blob(chunks, { type: "video/webm" });

  const file = new File([blob], "dropped-clip.mp4", { type: "video/mp4" });
  const dt = new DataTransfer();
  dt.items.add(file);
  const ev = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt });
  window.dispatchEvent(ev);

  // wait for the async import to settle
  for (let i = 0; i < 20; i++) {
    await new Promise((res) => setTimeout(res, 500));
    const t = await window.__atori.db.tracks.where("path").equals("dropped-clip.mp4").first();
    if (t) {
      return { imported: true, title: t.title, hasVideo: t.hasVideo, format: t.format, playable: t.playable };
    }
  }
  const toast = document.body.innerText.match(/No supported[^\n]*|[^\n]*Import complete[^\n]*/)?.[0];
  return { imported: false, toast };
});
console.log(JSON.stringify(r, null, 2));

let fail = 0;
if (!r.imported) {
  console.log("FAIL drop did not import");
  fail = 1;
} else {
  if (!r.hasVideo) { console.log("FAIL hasVideo not set"); fail = 1; }
  if (!r.playable) { console.log("FAIL marked unplayable"); fail = 1; }
  if (fail === 0) console.log("DROP IMPORT PASS");
}
for (const p of problems) console.log("  ", p);
await browser.close();
process.exit(fail === 0 && problems.length === 0 ? 0 : 1);
