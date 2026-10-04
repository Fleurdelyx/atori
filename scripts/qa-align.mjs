/**
 * Row-grid alignment measurement: loads the library TRACKS list and reports
 * the x-position of the album cell for every rendered row. Any variance
 * means the columns aren't sharing a real grid.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-align.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: await mkdtemp(join(tmpdir(), "atori-align-")),
  args: ["--no-first-run", "--mute-audio"],
  defaultViewport: { width: Number(process.env.QA_W ?? 1400), height: 880 },
});
const page = await browser.newPage();
await page.goto(`${process.env.QA_BASE ?? "http://127.0.0.1:1431"}/?demo`, { waitUntil: "domcontentloaded" });
await sleep(8500);

await page.evaluate(() => {
  const b = [...document.querySelectorAll("button, a")].find((x) => /^LIBRARY/i.test((x.textContent ?? "").trim()));
  if (b) b.click();
});
await sleep(1000);

const xs = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('div[role="button"].track-row')];
  return rows.slice(0, 20).map((r) => {
    // album cell = the 10rem column (3rd child on md layouts)
    const cells = [...r.children];
    const album = cells.find((c) => c.className.includes("10rem") || (c.className.includes("hidden") && c.className.includes("md:block")));
    return album ? Math.round(album.getBoundingClientRect().x) : null;
  });
});
const unique = [...new Set(xs.filter((x) => x !== null))];
console.log("album x positions:", JSON.stringify(xs));
console.log(`unique x values: ${unique.length}`);
if (unique.length <= 1) {
  console.log("ALIGNMENT OK");
  process.exit(0);
}
console.log("ALIGNMENT BROKEN");
process.exit(1);
