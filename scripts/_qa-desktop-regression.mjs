import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = process.env.PROBE_URL ?? "http://127.0.0.1:1431/";
mkdirSync("qa-shots/desktop-regression", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
await page.goto(BASE + "?demo", { waitUntil: "networkidle2", timeout: 45000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await page.evaluate(() => {
  localStorage.setItem("atori-ui", JSON.stringify({ state: { cloudSetupDone: true, offlineMode: false, catalogueEnabled: true }, version: 0 }));
});
await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
await page.waitForFunction(() => window.__atori?.db, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 3000));
const shot = (n) => page.screenshot({ path: `qa-shots/desktop-regression/${n}.png` });

await shot("01-home");
await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await new Promise((r) => setTimeout(r, 1200));
await shot("02-library");
await page.evaluate(async () => {
  const { engine, db } = window.__atori;
  const tracks = await db.tracks.limit(2).toArray();
  await engine.playQueue(tracks, 0);
  window.__atori.useUi.getState().setNowPlayingOpen(true);
});
await new Promise((r) => setTimeout(r, 2200));
await shot("03-np");
await page.evaluate(() => window.__atori.useUi.getState().setQueueOpen(true));
await new Promise((r) => setTimeout(r, 1000));
await shot("04-queue-phonograph");
console.log("DESKTOP ERRORS:", errors.length ? errors.join(" | ") : "none");
await browser.close();
