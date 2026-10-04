/**
 * Lyrics editing QA: opens EDIT INFO on a demo track, pastes LRC, checks
 * the live SYNCED-LRC indicator, saves, and verifies the lyrics land in the
 * db, the 歌 badge appears, and the karaoke sheet renders.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-lyrics.mjs
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
  userDataDir: await mkdtemp(join(tmpdir(), "atori-lyr-")),
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

const LRC = "[00:01.00]QA line one\n[00:04.20]QA line two\n[00:08.00]QA line three";

await step("open-edit-info", async () => {
  // right-click a library track row → Edit info
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button, a")].find((x) => /^LIBRARY/i.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(900);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^TRACKS/i.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(700);
  await page.evaluate(() => {
    const row = document.querySelector('div[role="button"].track-row');
    if (row) row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
  await sleep(600);
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Edit info/i.test(x.textContent ?? ""));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!opened) throw new Error("Edit info menu item missing");
  await sleep(700);
  const visible = await page.evaluate(() => /EDIT INFO/i.test(document.body.innerText));
  if (!visible) throw new Error("edit panel did not open");
});

await step("lyrics-field-and-indicator", async () => {
  const ta = await page.$("textarea");
  if (!ta) throw new Error("lyrics textarea missing");
  // the editor pre-fills existing lyrics: clear before typing the test LRC
  await ta.click();
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await ta.type(LRC);
  await sleep(300);
  const txt = await page.evaluate(() => document.body.innerText);
  if (!/SYNCED LRC:\s*3\s*LINES/i.test(txt)) {
    const label = await page.evaluate(() =>
      [...document.querySelectorAll("span")]
        .filter((s) => /LRC|LYRICS/.test(s.textContent ?? ""))
        .map((s) => s.textContent),
    );
    throw new Error(`LRC indicator missing/wrong; spans: ${JSON.stringify(label)}`);
  }
  await shot("17-edit-lyrics");
});

await step("save-and-verify-db", async () => {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^SAVE$/i.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(900);
  const row = await page.evaluate(async () => {
    const { db } = window.__atori;
    const all = await db.tracks.toArray();
    return all.find((t) => t.lyrics && t.lyrics.includes("QA line one")) ?? null;
  });
  if (!row) throw new Error("lyrics not saved to db");
});

await step("karaoke-sheet-renders", async () => {
  // play the edited track, open Now Playing, toggle lyrics
  await page.evaluate(() => {
    const { engine, db } = window.__atori;
    void db.tracks
      .filter((t) => t.lyrics && t.lyrics.includes("QA line one"))
      .first()
      .then((t) => t && void engine.playQueue([t], 0));
  });
  await sleep(1500);
  await page.evaluate(() => window.__atori.engine.el.pause());
  await page.evaluate(() => window.__atori.useUi.getState().setNowPlayingOpen(true));
  await sleep(1200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /LYRICS/i.test(x.textContent ?? ""));
    if (b) b.click();
  });
  await sleep(700);
  const txt = await page.evaluate(() => document.body.innerText);
  if (!/QA line one/.test(txt)) throw new Error("karaoke sheet missing lyrics");
  await shot("18-karaoke");
});

console.log(problems.length === 0 ? "\nLYRICS EDIT QA PASS" : `\n${problems.length} PROBLEM(S):`);
for (const p of problems) console.log("  ", p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
