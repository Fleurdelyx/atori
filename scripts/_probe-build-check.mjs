import puppeteer from "puppeteer-core";
import { preview } from "vite";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const server = await preview({ preview: { port: 4175, strictPort: true, host: "127.0.0.1" } });
const BASE = "http://127.0.0.1:4175/";
const browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ["--mute-audio"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 860 });
const requests = [];
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
page.on("request", (r) => {
  if (r.url().includes("__build")) requests.push(r.url());
});
await page.goto(BASE, { waitUntil: "networkidle2", timeout: 45000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 2000));

const stamp = await page.evaluate(() => document.querySelector('meta[name="atori-build"]')?.getAttribute("content") ?? "NONE");
console.log("BUILD STAMP:", stamp);

// going visible triggers the staleness check (same build: no toast)
await page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
});
await new Promise((r) => setTimeout(r, 1500));
console.log("CHECK FETCH FIRED:", requests.length > 0 ? "yes" : "NO");
const toastShown = await page.evaluate(() => document.body.innerText.includes("reload the page"));
console.log("FALSE-POSITIVE TOAST (expect false):", toastShown);
console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "none");
await browser.close();
await new Promise((r) => setTimeout(r, 100));
await server.close();
process.exit(0);
