import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = process.env.PROBE_URL ?? "https://atori.vercel.app/";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));

await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("button", { timeout: 30000 });
await page.evaluate(() => {
  localStorage.setItem(
    "atori-ui",
    JSON.stringify({ state: { cloudSetupDone: true, offlineMode: false, catalogueEnabled: true }, version: 0 }),
  );
  localStorage.setItem(
    "atori-auth",
    JSON.stringify({
      state: { serverUrl: "https://atori-cloud.atori-server.workers.dev", sessionToken: "", user: null },
      version: 0,
    }),
  );
});
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("button", { timeout: 30000 });
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("CATALOGUE")).click();
});
await new Promise((r) => setTimeout(r, 6000));

const state = await page.evaluate(() => {
  const text = document.body.textContent;
  return {
    emptyCaption: text.includes("NO CATALOGUE PLAYLISTS YET"),
    rinsPicks: text.includes("Rin's Picks"),
    albums: text.includes("CATALOGUE ALBUMS"),
  };
});
await page.screenshot({ path: "qa-shots/probe-catpl-anon.png" });
console.log("ANON CATALOGUE:", JSON.stringify(state));
console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "none");
await browser.close();
