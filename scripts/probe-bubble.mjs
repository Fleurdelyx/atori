import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

await page.goto("http://127.0.0.1:1430/?demo=1", { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await page.waitForFunction(async () => (await window.__atori.db.tracks.count()) > 0, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

// seat a paused queue, then open Now Playing
await page.evaluate(() => {
  void window.__atori.db.tracks.toArray().then((all) => {
    window.__atori.engine.playQueue(all.slice(2, 6), 0);
  });
});
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => window.__atori.useUi.getState().setNowPlayingOpen(true));
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: "qa-shots/bubble-1-np.png" });

// MINIMIZE → bubble appears, bottom bar gone
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("MINIMIZE"));
  b?.click();
});
await new Promise((r) => setTimeout(r, 1300));
await page.screenshot({ path: "qa-shots/bubble-2-minimized.png" });
const state1 = await page.evaluate(() => ({
  npOpen: window.__atori.useUi.getState().nowPlayingOpen,
  bubble: window.__atori.useUi.getState().miniBubble,
  bubbleVisible: !!document.querySelector(".clip-notch.fixed.z-\\[55\\]"),
  bottomBarGone: !document.querySelector("footer"),
}));

// drag the bubble by its body: pointer events
const pos1 = await page.evaluate(() => {
  const el = document.querySelector(".clip-notch.fixed.z-\\[55\\]");
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y };
});
await page.mouse.move(pos1.x + 130, pos1.y + 40);
await page.mouse.down();
await page.mouse.move(pos1.x + 130 - 400, pos1.y + 40 - 260, { steps: 12 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));
const pos2 = await page.evaluate(() => {
  const el = document.querySelector(".clip-notch.fixed.z-\\[55\\]");
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), stored: JSON.parse(localStorage.getItem("atori:bubblePos") ?? "null") };
});
await page.screenshot({ path: "qa-shots/bubble-3-dragged.png" });

// tap art → NP reopens, bubble gone
await page.evaluate(() => {
  const el = document.querySelector(".clip-notch.fixed.z-\\[55\\] button[aria-label='Open Now Playing']");
  el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 900));
const state2 = await page.evaluate(() => ({
  npOpen: window.__atori.useUi.getState().nowPlayingOpen,
  bubble: window.__atori.useUi.getState().miniBubble,
}));
await page.evaluate(() => window.__atori.useUi.getState().setNowPlayingOpen(false));
await new Promise((r) => setTimeout(r, 600));

// dismiss flow: minimize again then X → bottom bar returns
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("MINIMIZE"));
  b?.click();
});
await new Promise((r) => setTimeout(r, 900));
await page.evaluate(() => document.querySelector("button[aria-label='Dismiss mini player']")?.click());
await new Promise((r) => setTimeout(r, 700));
const state3 = await page.evaluate(() => ({
  bubble: window.__atori.useUi.getState().miniBubble,
  bottomBarBack: !!document.querySelector("footer"),
}));
await page.screenshot({ path: "qa-shots/bubble-4-dismissed.png" });

console.log(JSON.stringify({ state1, drag: { from: pos1, to: pos2 }, state2, state3, pageErrors: errors }, null, 1));
await browser.close();
