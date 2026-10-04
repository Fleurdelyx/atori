/**
 * Phonograph queue view check: plays a few tracks, opens the queue in the
 * phonograph layout, verifies disc/rail/history render, toggles back to the
 * classic panel, and confirms the choice persists across a reload.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-phonograph.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:1431";
mkdirSync("qa-shots", { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: await mkdtemp(join(tmpdir(), "atori-phono-")),
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

// play track row 1 from LIBRARY → TRACKS, then skip ahead twice for history
await clickNav("LIBRARY");
await sleep(1000);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /^TRACKS/i.test((x.textContent ?? "").trim()));
  if (b) b.click();
});
await sleep(800);
await page.evaluate(() => document.querySelector('div[role="button"].track-row')?.click());
await sleep(1800);
await page.evaluate(() => document.querySelector('footer button[title="Next"]')?.click());
await sleep(1200);
await page.evaluate(() => document.querySelector('footer button[title="Next"]')?.click());
await sleep(1200);

// open the queue: phonograph is the default layout
await page.evaluate(() => document.querySelector('footer button[aria-label="Open queue"]')?.click());
await sleep(900);

const inAside = (sel) =>
  page.evaluate((s) => !!document.querySelector("aside")?.querySelector(s), sel);

if (!(await inAside(".phono-disc"))) problems.push("phonograph: .phono-disc not found in aside");
if (!(await page.evaluate(() => [...(document.querySelector("aside")?.querySelectorAll("span") ?? [])].some((s) => s.textContent === "PHONOGRAPH"))))
  problems.push("phonograph: PHONOGRAPH wordmark missing");
if (!(await page.evaluate(() => [...(document.querySelector("aside")?.querySelectorAll("span") ?? [])].some((s) => /PLAYED/.test(s.textContent ?? "")))))
  problems.push("phonograph: PLAYED section missing (history rows)");
if (!(await inAside(".eq-glyph"))) problems.push("phonograph: current row eq-glyph missing");

const asideWide = await page.evaluate(() => {
  const a = document.querySelector("aside");
  return a ? Math.round(a.getBoundingClientRect().width) : 0;
});
if (asideWide < 700) problems.push(`phonograph: aside is only ${asideWide}px wide (expected ~920)`);
console.log(`ok   aside width ${asideWide}px`);

await page.screenshot({ path: "qa-shots/phono-1-phonograph.png" });
console.log("shot qa-shots/phono-1-phonograph.png");

// toggle to the classic panel via the header pill
await page.evaluate(() => document.querySelector('aside button[title="Switch to the classic list panel"]')?.click());
await sleep(900);
const panelNarrow = await page.evaluate(() => Math.round(document.querySelector("aside")?.getBoundingClientRect().width ?? 0));
if (panelNarrow !== 380) problems.push(`panel: aside is ${panelNarrow}px (expected 380)`);
if (await inAside(".phono-disc")) problems.push("panel: disc still rendered after toggle");
await page.screenshot({ path: "qa-shots/phono-2-panel.png" });
console.log("shot qa-shots/phono-2-panel.png");

// persistence: the choice should be in localStorage and survive a reload
const saved = await page.evaluate(() => {
  try {
    return JSON.parse(localStorage.getItem("atori-ui") ?? "{}")?.state?.queueStyle ?? null;
  } catch {
    return null;
  }
});
if (saved !== "panel") problems.push(`persistence: localStorage queueStyle is ${saved} (expected panel)`);

await page.evaluate(() => document.querySelector('aside button[title="Switch to the phonograph view"]')?.click());
await sleep(700);
await page.reload({ waitUntil: "domcontentloaded" });
await sleep(6000);
await page.evaluate(() => document.querySelector('footer button[aria-label="Open queue"]')?.click());
await sleep(900);
const reloaded = await page.evaluate(() => Math.round(document.querySelector("aside")?.getBoundingClientRect().width ?? 0));
if (reloaded < 700) problems.push(`persistence: after reload queue opens at ${reloaded}px (expected wide phonograph)`);
else console.log(`ok   after reload queue opens wide (${reloaded}px)`);

console.log(problems.length === 0 ? "\nPHONOGRAPH OK" : `\n${problems.length} PROBLEM(S):`);
for (const p of problems) console.log("  ", p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
