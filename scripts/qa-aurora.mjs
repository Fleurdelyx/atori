/**
 * Aurora dust check: switches to the AURORA background style and samples
 * the shader canvas for isolated bright square patches. Adjacent bright
 * regions (curtains/haze) are expected; the check fails on tiny isolated
 * squares far from any curtain.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-aurora.mjs
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
  userDataDir: await mkdtemp(join(tmpdir(), "atori-aur-")),
  args: ["--no-first-run", "--mute-audio", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1400, height: 880 },
});
const page = await browser.newPage();
await page.goto(`${BASE}/?demo`, { waitUntil: "domcontentloaded" });
await sleep(8500);

const result = await page.evaluate(async () => {
  window.__atori.useUi.getState().setBgStyle("aurora");
  await new Promise((r) => setTimeout(r, 2500));
  const canvas = document.querySelector("canvas");
  if (!canvas) return { error: "no canvas" };
  const c = document.createElement("canvas");
  const W = 320;
  const H = 180;
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.drawImage(canvas, 0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H).data;
  const lum = (x, y) => {
    const i = (y * W + x) * 4;
    return 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
  };
  // an aurora "dust" square was a solid ~1/40th-screen block: bright inside,
  // dark on all four neighbors a cell away. Count cells matching that.
  let squares = 0;
  const cell = 4; // 320/40 = 8px cell → sample at 4px resolution
  for (let y = cell * 2; y < H - cell * 2; y += cell) {
    for (let x = cell * 2; x < W - cell * 2; x += cell) {
      const l = lum(x, y);
      if (l < 70) continue;
      const far = cell * 2.5;
      const dark =
        lum(x, y - far) < 28 &&
        lum(x, y + far) < 28 &&
        lum(x - far, y) < 28 &&
        lum(x + far, y) < 28;
      if (dark) squares++;
    }
  }
  return { squares };
});
console.log(JSON.stringify(result));
if (result.error) process.exit(2);
console.log(result.squares === 0 ? "AURORA CLEAN: no isolated square patches" : `AURORA: ${result.squares} square-like patches remain`);
await browser.close();
process.exit(result.squares === 0 ? 0 : 1);
