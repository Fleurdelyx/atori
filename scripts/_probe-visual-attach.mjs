import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = "http://127.0.0.1:1431/";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
await page.goto(BASE + "?demo", { waitUntil: "networkidle2", timeout: 45000 });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem(
    "atori-ui",
    JSON.stringify({ state: { cloudSetupDone: true, offlineMode: false, catalogueEnabled: true }, version: 0 }),
  );
});
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await new Promise((r) => setTimeout(r, 1200));

// 1. "Attach visual" opens the (shared, DOM-attached) file input on mobile
const clicked = await page.evaluate(
  () =>
    new Promise((res) => {
      const orig = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function () {
        res(`clicked accept=${this.accept.slice(0, 24)} inDom=${document.body.contains(this)}`);
        HTMLInputElement.prototype.click = orig;
        return orig.call(this);
      };
      setTimeout(() => {
        HTMLInputElement.prototype.click = orig;
        res("none");
      }, 3000);
      const row = document.querySelector(".track-row");
      const r = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 60, clientY: r.top + 20 }));
      setTimeout(() => {
        const item = [...document.querySelectorAll("[data-atori-ctxmenu] button")].find((b) => (b.textContent ?? "").includes("Attach visual"));
        if (!item) return res("NO MENU ITEM");
        item.click();
      }, 500);
    }),
);
console.log("ATTACH VISUAL ->", clicked);

// 2. an attached visual shows the film badge on the row tile
await page.evaluate(async () => {
  const { db } = window.__atori;
  const t = (await db.tracks.limit(1).toArray())[0];
  await db.visuals.put({ trackId: t.id, blob: new Blob([new Uint8Array([1])], { type: "video/mp4" }), mime: "video/mp4", kind: "clip", createdAt: Date.now() });
});
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await new Promise((r) => setTimeout(r, 1500));
const badge = await page.evaluate(() => {
  const row = document.querySelector(".track-row");
  return { film: !!row?.querySelector("svg.lucide-film"), row: (row?.textContent ?? "").slice(0, 40) };
});
console.log("VISUAL BADGE:", JSON.stringify(badge), badge.film ? "OK" : "FAIL");
console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "none");
await browser.close();
