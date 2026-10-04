/**
 * Shuffle-consistency check: the track the engine plays must always equal the
 * track the UI displays, across shuffle toggles, next/prev, and queue jumps.
 * Uses the dev-only window.__atori hook.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-shuffle.mjs
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
  userDataDir: await mkdtemp(join(tmpdir(), "atori-shuf-")),
  args: ["--no-first-run", "--mute-audio"],
  defaultViewport: { width: 1400, height: 880 },
});
const page = await browser.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));

await page.goto(`${BASE}/?demo`, { waitUntil: "domcontentloaded" });
await sleep(9000);

const clickNav = async (label) => {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll("button, a")].find((x) => (x.textContent ?? "").trim().startsWith(l));
    if (b) b.click();
  }, label);
};
const miniTitle = () =>
  page.evaluate(() => {
    const el = document.querySelector('footer [class*="whitespace-nowrap"]');
    return el?.textContent?.trim() ?? "";
  });
const engineCurrent = () =>
  page.evaluate(() => {
    const e = window.__atori?.engine;
    return e ? e.current?.title ?? null : "(no __atori)";
  });
const shownMatchesEngine = async (label) => {
  await sleep(600);
  const ui = await miniTitle();
  const eng = await engineCurrent();
  if (!eng || eng === "(no __atori)") problems.push(`${label}: engine unavailable`);
  else if (ui !== eng) problems.push(`${label}: UI shows "${ui}" but engine plays "${eng}"`);
  else console.log(`ok   ${label}: "${ui}"`);
};

// play track row 1 from LIBRARY → TRACKS
await clickNav("LIBRARY");
await sleep(1000);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /^TRACKS/i.test((x.textContent ?? "").trim()));
  if (b) b.click();
});
await sleep(800);
await page.evaluate(() => document.querySelector('div[role="button"].track-row')?.click());
await sleep(1800);
await shownMatchesEngine("initial play");

// toggle shuffle ON: current track must not change
await page.evaluate(() => {
  const b = [...document.querySelectorAll("footer button")].find((x) => (x.getAttribute("aria-label") ?? "") === "Shuffle");
  if (b) b.click();
});
await sleep(600);
await shownMatchesEngine("shuffle on");

// next / prev under shuffle
const clickAria = (label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll("footer button")].find((x) => (x.getAttribute("aria-label") ?? "") === l);
    if (b) { b.click(); return true; }
    return false;
  }, label);
if (await clickAria("Next")) await shownMatchesEngine("next under shuffle");
else {
  await page.evaluate(() => document.querySelector('footer button[title="Next"]')?.click());
  await shownMatchesEngine("next under shuffle");
}
await page.evaluate(() => document.querySelector('footer button[title="Next"]')?.click());
await shownMatchesEngine("next #2 under shuffle");
await page.evaluate(() => document.querySelector('footer button[title="Previous"]')?.click());
await shownMatchesEngine("prev under shuffle");

// shuffle OFF: current must survive too
await clickAria("Shuffle");
await sleep(600);
await shownMatchesEngine("shuffle off");

// queue jump under shuffle: open queue, click the 2nd visible row
await clickAria("Open queue");
await sleep(700);
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('div[role="button"].track-row, div[class*="cursor-pointer"][class*="h-12"]')]
    .filter((d) => d.closest("aside"));
  rows[1]?.click();
});
await sleep(1800);
await shownMatchesEngine("queue jump under shuffle");

console.log(problems.length === 0 ? "\nSHUFFLE CONSISTENT" : `\n${problems.length} PROBLEM(S):`);
for (const p of problems) console.log("  ", p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
