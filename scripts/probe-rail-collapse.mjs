import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:1430/", { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 3000));

await page.evaluate(() => {
  const b = document.querySelector('button[aria-label="Collapse sidebar"]');
  b?.click();
});
await new Promise((r) => setTimeout(r, 700));

const state = await page.evaluate(() => {
  const img = document.querySelector("nav img");
  const wrap = img?.closest("div");
  const toggle = document.querySelector('button[aria-label="Expand sidebar"]');
  const tr = toggle?.getBoundingClientRect();
  return {
    logoWidth: img ? Math.round(img.getBoundingClientRect().width) : null,
    wrapperWidth: wrap ? Math.round(wrap.getBoundingClientRect().width) : null,
    wrapperOpacity: wrap ? getComputedStyle(wrap).opacity : null,
    toggleX: tr ? Math.round(tr.x) : null,
    toggleCentered: tr ? Math.abs(tr.x + tr.width / 2 - 34) < 10 : null,
  };
});
const nav = await page.$("nav");
await nav?.screenshot({ path: "qa-shots/rail-collapsed-nologo.png" });
console.log(JSON.stringify(state));
await browser.close();
