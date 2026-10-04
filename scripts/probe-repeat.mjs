import puppeteer from "puppeteer-core";

const exe = process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 900, height: 700, deviceScaleFactor: 3 },
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:1430/?demo=1", { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
// wait for the demo import, then seat a paused queue so the transport exists
await page.waitForFunction(async () => {
  const n = await window.__atori.db.tracks.count();
  return n > 0;
}, { timeout: 30000 });
await page.evaluate(async () => {
  const tracks = await window.__atori.db.tracks.toArray();
  window.__atori.engine.restoreQueue(tracks.slice(0, 3), 0, 0);
  window.__atori.useUi.getState().setNowPlayingOpen(true);
  window.__atori.engine.setRepeat("one");
});
await new Promise((r) => setTimeout(r, 3000)); // let the overlay entrance + slice wipe settle
const btn = await page.$('button[aria-label="Repeat one"]');
const box = await btn.boundingBox();
console.log(JSON.stringify(box));
await page.screenshot({ path: "qa-shots/probe-repeat-full.png" });
await page.screenshot({
  path: "qa-shots/probe-repeat-v3.png",
  clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 },
});
await page.evaluate((b) => {
  window.__atori.engine.setRepeat(b);
  window.__atori.useUi.getState().setNowPlayingOpen(false);
}, "off");
console.log("saved");
await browser.close();
