import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1377, height: 877 },
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:1430/", { waitUntil: "domcontentloaded", timeout: 30000 });
// boot plays on a fresh session: catch it mid-run before it finishes
await new Promise((r) => setTimeout(r, 2200));
await page.screenshot({ path: "qa-shots/boot-seams.png" });
// sample pixels across a suspected seam column for brightness spikes
const leak = await page.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  // can't rasterize the DOM; instead count bg-colored slices coverage via
  // elementFromPoint along a diagonal band boundary
  const appVisible = [];
  for (let i = 0; i < 40; i++) {
    const x = Math.round((window.innerWidth / 40) * i + 7);
    const y = Math.round((window.innerHeight / 40) * i + 7);
    const el = document.elementFromPoint(x, y);
    const inBoot = !!el?.closest(".fixed.z-\\[100\\]") || !!el?.closest("[class*='boot']");
    if (!inBoot) appVisible.push(`${x},${y}:${(el?.className ?? "").toString().slice(0, 30)}`);
  }
  return appVisible;
});
console.log(JSON.stringify({ leakCount: leak.length, leak: leak.slice(0, 5) }));
await browser.close();
