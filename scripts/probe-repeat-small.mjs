import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1280, height: 860, deviceScaleFactor: 4 },
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:1430/?demo=1", { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => window.__atori.engine.setRepeat("one"));
await new Promise((r) => setTimeout(r, 800));
// the mini player's repeat button (transport row, bottom bar)
const box = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button[aria-label*='epeat'], button[title*='epeat']")];
  const b = btns.find((x) => x.getBoundingClientRect().y > 700) ?? btns[0];
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, label: b.getAttribute("aria-label") ?? b.getAttribute("title") };
});
if (box) {
  await page.screenshot({
    path: "qa-shots/repeat-small-zoom.png",
    clip: { x: box.x - 6, y: box.y - 6, width: box.w + 12, height: box.h + 12 },
  });
}
console.log(JSON.stringify(box));
await browser.close();
