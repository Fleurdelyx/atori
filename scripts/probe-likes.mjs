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
await new Promise((r) => setTimeout(r, 1200));

// 1. focus outline: click into the home search, read the outline style
await page.click("input[placeholder*='SEARCH']");
const outline = await page.evaluate(() => {
  const el = document.activeElement;
  return el ? getComputedStyle(el).outlineStyle : null;
});

// 2. like two tracks from the library tracks tab
await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await new Promise((r) => setTimeout(r, 900));
await page.evaluate(() => {
  const rows = [...document.querySelectorAll("div.track-row")].slice(0, 2);
  for (const row of rows) {
    const btn = [...row.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Like "));
    btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
});
await new Promise((r) => setTimeout(r, 500));
const heartState = await page.evaluate(() => {
  const favs = JSON.parse(localStorage.getItem("atori-favs") ?? "null");
  const rows = [...document.querySelectorAll("div.track-row")].slice(0, 2);
  const filled = rows.map((row) => {
    const btn = [...row.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Remove "));
    const svg = btn?.querySelector("svg");
    return svg ? svg.getAttribute("fill") : null;
  });
  return { stored: favs?.state?.keys?.length ?? 0, filled };
});
await page.screenshot({ path: "qa-shots/likes-rows.png", clip: { x: 200, y: 60, width: 1080, height: 500 } });

// 3. sidebar: LIKED entry first, click opens the liked view
const sidebar = await page.evaluate(() => {
  const nav = document.querySelector("nav");
  const btn = nav?.querySelector("button[aria-label='Liked Songs']");
  if (!btn) return { found: false };
  btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return { found: true };
});
await new Promise((r) => setTimeout(r, 900));
const likedView = await page.evaluate(() => {
  const h2s = [...document.querySelectorAll("h2")].map((h) => h.textContent);
  const tab = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("PLAYLISTS"));
  return {
    title: document.body.textContent?.includes("Liked Songs") ?? false,
    h2s: h2s.slice(0, 5),
    onPlaylistsTab: !!tab,
  };
});
await page.screenshot({ path: "qa-shots/liked-view.png" });

console.log(JSON.stringify({ outline, heartState, sidebar, likedView, pageErrors: errors }, null, 1));
await browser.close();
