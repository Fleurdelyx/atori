/**
 * REAL drag-drop QA: dispatches a genuine OS-style file drag via CDP
 * (Input.dispatchDragEvent with real file paths, exactly what a drop from
 * Explorer provides) and asserts the file imports into the library.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-drop-real.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:1431";
const WAV = join(tmpdir(), "atori-drop-test.wav");

const browser = await puppeteer.launch({
  executablePath: process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: await mkdtemp(join(tmpdir(), "atori-rdrop-")),
  args: ["--no-first-run", "--mute-audio"],
  defaultViewport: { width: 1400, height: 880 },
});
const page = await browser.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));

await page.goto(`${BASE}/?demo`, { waitUntil: "domcontentloaded" });
await sleep(8500);

const client = await page.createCDPSession();
// drag the real file over the empty-library stage, then drop it
await client.send("Input.dispatchDragEvent", {
  type: "dragEnter",
  x: 700,
  y: 400,
  data: { files: [WAV], items: [], dragOperationsMask: 1 },
});
await client.send("Input.dispatchDragEvent", {
  type: "dragOver",
  x: 720,
  y: 420,
  data: { files: [WAV], items: [], dragOperationsMask: 1 },
});
await client.send("Input.dispatchDragEvent", {
  type: "drop",
  x: 720,
  y: 420,
  data: { files: [WAV], items: [], dragOperationsMask: 1 },
});

let imported = false;
let info = null;
for (let i = 0; i < 20; i++) {
  await sleep(500);
  info = await page.evaluate(async () => {
    const { db } = window.__atori;
    const t = await db.tracks.where("path").equals("atori-drop-test.wav").first();
    return t ? { title: t.title, format: t.format, playable: t.playable, duration: t.duration } : null;
  });
  if (info) {
    imported = true;
    break;
  }
}
console.log(JSON.stringify({ imported, info }));
if (!imported) {
  const toast = await page.evaluate(() => document.body.innerText.match(/No supported[^\n]*|Import complete[^\n]*/)?.[0] ?? "(no toast)");
  console.log("toast:", toast);
  console.log("FAIL real drop did not import");
} else {
  console.log("REAL DROP PASS");
}
for (const p of problems) console.log("  ", p);
await browser.close();
process.exit(imported && problems.length === 0 ? 0 : 1);
