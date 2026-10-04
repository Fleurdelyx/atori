/**
 * Keyboard muscle-memory QA: the Spotify-convention keys:
 *   / focuses the library filter, Esc peels overlays (queue → Now Playing),
 *   Space toggles exactly once even with a button focused.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-keys.mjs
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
  userDataDir: await mkdtemp(join(tmpdir(), "atori-keys-")),
  args: ["--no-first-run", "--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1400, height: 880 },
});
const page = await browser.newPage();
const problems = [];
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${String(e).slice(0, 240)}`);
    console.log(`FAIL ${name}: ${String(e).slice(0, 240)}`);
  }
};

await page.goto(`${BASE}/?demo`, { waitUntil: "domcontentloaded" });
await sleep(8500);

await step("slash-focuses-filter", async () => {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button, a")].find((x) => /^LIBRARY/i.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(900);
  await page.keyboard.press("/");
  await sleep(300);
  const st = await page.evaluate(() => ({
    focused: document.activeElement?.placeholder ?? "",
    value: document.activeElement?.value ?? null,
  }));
  if (!st.focused.startsWith("SEARCH")) throw new Error(`/ did not focus the filter (got ${JSON.stringify(st.focused)})`);
  await page.keyboard.type("fluke");
  await sleep(500);
  const filtered = await page.evaluate(() => document.body.innerText);
  if (!/Fluke/i.test(filtered)) throw new Error("typed filter text lost");
  // clear the filter so later steps see the full library
  await page.keyboard.press("Escape");
  await sleep(200);
  await page.keyboard.press("/");
  await sleep(300);
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await sleep(300);
  await page.evaluate(() => document.activeElement?.blur());
});

await step("space-double-toggle-guard", async () => {
  // start playback via row click, pause via Space with a button focused
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^TRACKS/i.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(700);
  await page.evaluate(() => document.querySelector('div[role="button"].track-row')?.click());
  await sleep(1500);
  const isPlaying = () => page.evaluate(() => !window.__atori.engine.el.paused);
  if (!(await isPlaying())) throw new Error("playback did not start");
  await page.evaluate(() => document.querySelector("footer button")?.focus());
  await page.keyboard.press(" ");
  await sleep(900); // pause fade-out takes a beat
  const pausedOnce = !(await isPlaying());
  await page.keyboard.press(" ");
  await sleep(900);
  const playingAgain = await isPlaying();
  if (!pausedOnce) throw new Error("Space on focused button did not toggle");
  if (!playingAgain) throw new Error("Space double-toggled (net zero)");
});

await step("esc-peels-overlays", async () => {
  // open queue, open Now Playing, then Esc ×2: queue closes first, then NP
  await page.evaluate(() => window.__atori.useUi.getState().setQueueOpen(true));
  await page.evaluate(() => window.__atori.useUi.getState().setNowPlayingOpen(true));
  await sleep(900);
  await page.keyboard.press("Escape");
  await sleep(500);
  const queueClosed = await page.evaluate(() => !window.__atori.useUi.getState().queueOpen);
  const npStill = await page.evaluate(() => window.__atori.useUi.getState().nowPlayingOpen);
  if (!queueClosed) throw new Error("queue should close first");
  if (!npStill) throw new Error("Now Playing closed before queue");
  await page.keyboard.press("Escape");
  await sleep(500);
  const npClosed = await page.evaluate(() => !window.__atori.useUi.getState().nowPlayingOpen);
  if (!npClosed) throw new Error("Now Playing did not close on second Esc");
});

await step("album-line-navigates", async () => {
  await page.evaluate(() => window.__atori.useUi.getState().setNowPlayingOpen(true));
  await sleep(1100);
  const found = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Go to /i.test(x.getAttribute("title") ?? ""));
    if (!b) return { found: false, np: window.__atori.useUi.getState().nowPlayingOpen };
    b.click();
    return { found: true };
  });
  if (!found.found) throw new Error(`album button not found (np open: ${found.np})`);
  await sleep(1100);
  const view = await page.evaluate(() => ({
    view: window.__atori.useUi.getState().view,
    key: window.__atori.useUi.getState().albumKey,
  }));
  if (view.view !== "album" || !view.key) throw new Error(`album line did not navigate: ${JSON.stringify(view)}`);
});

console.log(problems.length === 0 ? "\nKEYBOARD QA PASS" : `\n${problems.length} PROBLEM(S):`);
for (const p of problems) console.log("  ", p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
