/**
 * Pinned playlists QA: pin from the library row, see it in the rail, click
 * it from another view, unpin. Uses the dev Dexie hook to guarantee a
 * playlist exists.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-pin.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:1431";
await mkdir("qa-shots", { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: await mkdtemp(join(tmpdir(), "atori-pin-")),
  args: ["--no-first-run", "--mute-audio"],
  defaultViewport: { width: 1400, height: 880 },
});
const page = await browser.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${String(e).slice(0, 240)}`);
    console.log(`FAIL ${name}: ${String(e).slice(0, 240)}`);
  }
};
const shot = (name) => page.screenshot({ path: join("qa-shots", `${name}.png`) });

await step("boot", async () => {
  await page.goto(`${BASE}/?demo`, { waitUntil: "domcontentloaded" });
  await sleep(8500);
  if (!(await page.evaluate(() => !!window.__atori?.db))) throw new Error("dev hook missing");
});

let plId;
await step("seed-playlist", async () => {
  plId = await page.evaluate(async () => {
    const { db } = window.__atori;
    const demo = await db.tracks.toArray();
    const id = await db.playlists.add({ name: "Pin Target", trackIds: demo.slice(0, 3).map((t) => t.id), createdAt: Date.now() });
    return id;
  });
  if (!plId) throw new Error("playlist not created");
});

await step("pin-from-row", async () => {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button, a")].find((x) => /^LIBRARY/i.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^PLAYLISTS/i.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(600);
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") ?? "") === "Pin Pin Target");
    if (b) { b.click(); return true; }
    return false;
  });
  if (!clicked) throw new Error("pin button missing on row");
  await sleep(400);
  const pinned = await page.evaluate(() => window.__atori.useUi.getState().pinnedPlaylists);
  if (!pinned.includes(plId)) throw new Error(`pin state not saved: ${JSON.stringify(pinned)}`);
});

await step("rail-shows-pin", async () => {
  await page.evaluate(() => window.__atori.useUi.getState().navigate("home"));
  await sleep(600);
  // the rail lists every playlist; pinned ones carry the pin marker glyph
  const rail = await page.evaluate(() => {
    const nav = document.querySelector("nav");
    if (!nav || !/Pin Target/.test(nav.innerText)) return false;
    const row = [...nav.querySelectorAll("button")].find((x) => /Pin Target/.test(x.textContent ?? ""));
    return !!row?.querySelector('svg[fill="currentColor"]');
  });
  if (!rail) throw new Error("pinned row (with pin marker) not visible in the rail");
  await shot("21-rail-pinned");
});

await step("rail-click-opens-playlist", async () => {
  // navigate away first, then click the pinned row in the rail
  await page.evaluate(() => window.__atori.useUi.getState().navigate("settings"));
  await sleep(700);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("nav button")].find((x) => /Pin Target/.test(x.textContent ?? ""));
    if (b) b.click();
  });
  await sleep(1000);
  const st = await page.evaluate((id) => {
    const s = window.__atori.useUi.getState();
    return { view: s.view, focus: s.playlistFocus?.id ?? null };
  }, plId);
  if (st.view !== "library" || st.focus !== plId) throw new Error(`rail click failed: ${JSON.stringify(st)}`);
  const selected = await page.evaluate(() => document.body.innerText.includes("Pin Target"));
  if (!selected) throw new Error("playlist pane did not select the pinned playlist");
  await shot("22-pinned-open");
});

await step("unpin-removes-marker-from-rail", async () => {
  await page.evaluate((id) => window.__atori.useUi.getState().togglePinnedPlaylist(id), plId);
  await sleep(400);
  // the rail still lists the playlist (it lists all of them): the pin
  // marker must be gone and the pin state cleared
  const rail = await page.evaluate((id) => {
    const state = window.__atori.useUi.getState();
    if (state.pinnedPlaylists.includes(id)) return false;
    const nav = document.querySelector("nav");
    if (!nav || !/Pin Target/.test(nav.innerText)) return true; // gone entirely is fine too
    const row = [...nav.querySelectorAll("button")].find((x) => /Pin Target/.test(x.textContent ?? ""));
    return !row?.querySelector('svg[fill="currentColor"]');
  }, plId);
  if (!rail) throw new Error("pinned row still marked in rail after unpin");
});

console.log(problems.length === 0 ? "\nPINNED PLAYLISTS PASS" : `\n${problems.length} PROBLEM(S):`);
for (const p of problems) console.log("  ", p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
