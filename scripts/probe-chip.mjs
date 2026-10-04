import puppeteer from "puppeteer-core";

const exe = process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 900, height: 700, deviceScaleFactor: 4 },
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:1430/?demo=1", { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await page.waitForFunction(async () => (await window.__atori.db.tracks.count()) > 0, { timeout: 30000 });
await page.evaluate(async () => {
  const tracks = await window.__atori.db.tracks.toArray();
  window.__atori.engine.restoreQueue(tracks.slice(0, 3), 0, 0);
  window.__atori.useUi.getState().setNowPlayingOpen(true);
  window.__atori.useUi.getState().setNpFlat(true);
});
await new Promise((r) => setTimeout(r, 3000));

const m = await page.evaluate(() => {
  const row = document.querySelector("div.mt-7.flex.items-center.justify-center.gap-3");
  if (!row) return { err: "row missing" };
  const chip = row.querySelector("span"); // GradeBadge root
  const inner = chip?.firstElementChild; // the label span inside the badge
  const spans = [...row.querySelectorAll(":scope > span")];
  const text = spans[spans.length - 1]; // the kHz span
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2), left: +b.left.toFixed(2), right: +b.right.toFixed(2), h: +b.height.toFixed(2) };
  };
  // ink box of the chip label via a Range around its text
  const range = document.createRange();
  range.selectNodeContents(chip);
  const ink = r(range);
  const chipR = r(chip);
  const textR = r(text);
  return {
    chip: chipR,
    chipText: ink,
    chipInnerSpan: r(inner),
    text: textR,
    chipTextCenterDeltaVsChip: ink && chipR ? +((ink.top + ink.bottom) / 2 - (chipR.top + chipR.bottom) / 2).toFixed(2) : null,
    chipTextCenterDeltaVsText: ink && textR ? +((ink.top + ink.bottom) / 2 - (textR.top + textR.bottom) / 2).toFixed(2) : null,
    chipClass: chip?.className,
  };
});
console.log(JSON.stringify(m, null, 1));
const row = await page.evaluateHandle(() => document.querySelector("div.mt-7.flex.items-center.justify-center.gap-3"));
const b = await row.asElement().boundingBox();
await page.screenshot({ path: "qa-shots/probe-chip.png", clip: { x: b.x, y: b.y - 4, width: b.width, height: b.height + 8 } });
await page.evaluate(() => {
  window.__atori.useUi.getState().setNowPlayingOpen(false);
});
await browser.close();
