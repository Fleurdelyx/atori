import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = process.env.PROBE_URL ?? "http://127.0.0.1:1430/";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

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
    JSON.stringify({ state: { serverUrl: "https://atori-cloud.atori-server.workers.dev", sessionToken: "", user: null }, version: 0 }),
  );
});
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("button", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));

const clickNav = async (label) => {
  await page.evaluate((l) => {
    [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(l)).click();
  }, label);
};
const screenTitle = () =>
  page.evaluate(() => document.querySelector("h1")?.textContent?.slice(0, 30) ?? "");

await clickNav("CATALOGUE");
await new Promise((r) => setTimeout(r, 2500));
const t1 = await screenTitle();
await page.evaluate(() => {
  // open the first album card (album view)
  const card = document.querySelector("[class*='clip-'] img")?.closest("div[class*='cursor'], div[role='button'], div");
  (card ?? document.body).dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 2000));
const t2 = await screenTitle();

// browser-chrome back: real popstate through the web history
await page.goBack();
await new Promise((r) => setTimeout(r, 1200));
const t3 = await screenTitle();
await page.goForward();
await new Promise((r) => setTimeout(r, 1200));
const t4 = await screenTitle();

// app-side shortcuts drive the same stack
await page.keyboard.down("Alt");
await page.keyboard.press("ArrowLeft");
await page.keyboard.up("Alt");
await new Promise((r) => setTimeout(r, 1200));
const t5 = await screenTitle();

console.log(JSON.stringify({ catalogue: t1, afterClick: t2, afterBrowserBack: t3, afterBrowserFwd: t4, afterAltBack: t5 }));
console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "none");
await page.screenshot({ path: "qa-shots/probe-history.png" });
await browser.close();
