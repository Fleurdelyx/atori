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

// NO auth injection: signed-out, fresh profile
await page.goto("http://127.0.0.1:1430/", { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 4500));

await page.evaluate(() => window.__atori.useUi.getState().navigate("catalogue"));
await new Promise((r) => setTimeout(r, 2500));

// catalogue visible signed-out?
const state = await page.evaluate(() => {
  const h1 = document.querySelector("h1")?.textContent ?? "";
  const rows = document.querySelectorAll("div.track-row").length;
  const chip = [...document.querySelectorAll("header span")].map((s) => s.textContent).find((t) => t?.includes("TRACKS"));
  const adminButtons = [...document.querySelectorAll("button")].filter(
    (b) => (b.textContent ?? "").includes("UPLOAD TO CATALOGUE"),
  ).length;
  return { h1, rows, chip, adminButtons };
});
await page.screenshot({ path: "qa-shots/anon-catalogue.png" });

// play a catalogue track anonymously
await page.evaluate(() => {
  const row = document.querySelectorAll("div.track-row")[1];
  row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1800));
const playback = await page.evaluate(() => ({
  queue: window.__atori.engine.queue.length,
  playing: window.__atori.engine.el && !window.__atori.engine.el.paused,
  time: window.__atori.engine.el?.currentTime ?? 0,
}));
await page.screenshot({ path: "qa-shots/anon-playing.png", clip: { x: 0, y: 780, width: 1280, height: 80 } });

// search bar filters
await page.type('input[placeholder="SEARCH ・ 検索…"]', "escape");
await new Promise((r) => setTimeout(r, 500));
const searchRows = await page.evaluate(() => document.querySelectorAll("div.track-row").length);
await page.screenshot({ path: "qa-shots/anon-search.png" });

// heart between number and art (geometry order in DOM)
const heartOrder = await page.evaluate(() => {
  const row = document.querySelectorAll("div.track-row")[0];
  if (!row) return null;
  const kids = [...row.children].map((c) => (c.className + " " + c.textContent?.slice(0, 8)).slice(0, 26));
  const heartIdx = [...row.querySelectorAll("button")].findIndex((b) => (b.getAttribute("aria-label") ?? "").startsWith("Like "));
  return { kids, heartIdx };
});

console.log(JSON.stringify({ state, playback, searchRows, heartOrder, pageErrors: errors }, null, 1));
await browser.close();
