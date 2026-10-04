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

await page.evaluate(() => {
  void window.__atori.db.tracks.toArray().then((all) => window.__atori.engine.playQueue(all.slice(2, 5), 0));
});
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => window.__atori.useUi.getState().setNowPlayingOpen(true));
await new Promise((r) => setTimeout(r, 1200));

// like from NP transport, verify it lands in favorites + fills accent
const before = await page.evaluate(() => JSON.parse(localStorage.getItem("atori-favs") ?? '{"state":{"keys":[]}}').state.keys.length);
await page.evaluate(() => document.querySelector("button[aria-label='Like']")?.click());
await new Promise((r) => setTimeout(r, 500));
const after = await page.evaluate(() => JSON.parse(localStorage.getItem("atori-favs") ?? '{"state":{"keys":[]}}').state.keys.length);
const likeBtn = await page.evaluate(() => {
  const b = document.querySelector("button[aria-label='Unlike']");
  const svg = b?.querySelector("svg");
  return { exists: !!b, fill: svg?.getAttribute("fill") ?? null };
});
await page.screenshot({ path: "qa-shots/np-like.png", clip: { x: 200, y: 620, width: 880, height: 220 } });

// theatre + flat also show it (same Controls component)
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("THEATRE"));
  b?.click();
});
await new Promise((r) => setTimeout(r, 1000));
const theatreLike = await page.evaluate(() => !!document.querySelector("button[aria-label='Unlike'], button[aria-label='Like']"));
await page.screenshot({ path: "qa-shots/np-like-theatre.png" });
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("THEATRE"));
  b?.click();
});
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith("FLAT"));
  b?.click();
});
await new Promise((r) => setTimeout(r, 1000));
const flatLike = await page.evaluate(() => !!document.querySelector("button[aria-label='Unlike'], button[aria-label='Like']"));
await page.screenshot({ path: "qa-shots/np-like-flat.png" });

console.log(JSON.stringify({ before, after, likeBtn, theatreLike, flatLike, pageErrors: errors }, null, 1));
await browser.close();
