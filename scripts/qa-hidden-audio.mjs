import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = process.env.PROBE_URL ?? "http://127.0.0.1:1431/";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(BASE + "?demo", { waitUntil: "networkidle2", timeout: 45000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await page.evaluate(() => {
  localStorage.setItem("atori-ui", JSON.stringify({ state: { cloudSetupDone: true, offlineMode: false, catalogueEnabled: true }, version: 0 }));
});
await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
await page.waitForFunction(() => window.__atori?.db, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2000));

const state = async () =>
  page.evaluate(() => {
    const e = window.__atori.engine.el;
    return {
      paused: e.paused,
      t: Number(e.currentTime.toFixed(2)),
      vol: Number(e.volume.toFixed(3)),
      src: (e.currentSrc || e.src || "").slice(0, 40),
      sessionState: navigator.mediaSession.playbackState,
      hasMetadata: !!navigator.mediaSession.metadata,
    };
  });

await page.evaluate(async () => {
  const { engine, db } = window.__atori;
  const tracks = await db.tracks.limit(3).toArray();
  await engine.playQueue(tracks, 0);
});
await new Promise((r) => setTimeout(r, 2500));
console.log("PLAYING:", JSON.stringify(await state()));

// simulate the tab going away: visibilitychange hidden + lifecycle frozen
const cdp = await page.createCDPSession();
await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }));
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
console.log("HIDDEN-EVENT:", JSON.stringify(await state()));

await cdp.send("Page.setWebLifecycleState", { state: "frozen" }).catch((e) => console.log("FREEZE unsupported:", String(e).slice(0, 80)));
await new Promise((r) => setTimeout(r, 3000));
console.log("FROZEN+3s:", JSON.stringify(await state()));
await cdp.send("Page.setWebLifecycleState", { state: "active" }).catch(() => {});
await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }));
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await new Promise((r) => setTimeout(r, 1500));
console.log("BACK-VISIBLE:", JSON.stringify(await state()));
console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "none");
await browser.close();
