import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1200, height: 860 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

await page.goto("http://127.0.0.1:1430/?demo=1", { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await page.waitForFunction(async () => (await window.__atori.db.tracks.count()) > 0, { timeout: 30000 });

// open the playlist create dialog
await page.evaluate(() => window.__atori.useUi.getState().setPlaylistCreate({}));
await new Promise((r) => setTimeout(r, 600));

// pick the test image through the real file input
const input = await page.$('input[type="file"][accept="image/*"]');
await input?.uploadFile("C:\\Users\\user\\Desktop\\Atori\\qa-shots\\crop-test.png");
await new Promise((r) => setTimeout(r, 1200));

const cropOpen = await page.evaluate(() => !!document.querySelector('canvas[width="512"]'));
const cropTitle = await page.evaluate(() => [...document.querySelectorAll("span")].some((s) => (s.textContent ?? "").includes("CROP PLAYLIST PICTURE")));
await page.screenshot({ path: "qa-shots/crop-editor.png" });

// zoom via the slider, then apply the crop
await page.evaluate(() => {
  const slider = document.querySelector('input[aria-label="Zoom"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(slider, "2.4");
  slider.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("APPLY CROP"));
  b?.click();
});
await new Promise((r) => setTimeout(r, 900));

const confirmShown = await page.evaluate(() => [...document.querySelectorAll("span")].some((s) => (s.textContent ?? "").includes("USE THIS PICTURE?")));
await page.screenshot({ path: "qa-shots/crop-confirm.png" });

await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("CONFIRM"));
  b?.click();
});
await new Promise((r) => setTimeout(r, 700));

const previewInDialog = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll("img")].filter((i) => i.closest("button[title='Choose a picture']"));
  return imgs.length > 0 && imgs[0].src.startsWith("blob:");
});
const captionGone = await page.evaluate(() => ![...document.querySelectorAll("p")].some((p) => (p.textContent ?? "").includes("NO PICTURE")));
const removeLink = await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").trim() === "REMOVE PICTURE"));
await page.screenshot({ path: "qa-shots/crop-applied.png" });

console.log(JSON.stringify({ cropOpen, cropTitle, confirmShown, previewInDialog, captionGone, removeLink, pageErrors: errors }, null, 1));
await browser.close();
