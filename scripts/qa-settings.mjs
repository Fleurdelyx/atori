import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let page = (await browser.pages())[0];
for (const t of await browser.pages()) { const u = await t.url(); if (u.includes("localhost") || u.includes("tauri")) page = t; }
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button, a")].find((x) => /^SETTINGS/i.test((x.textContent ?? "").trim()));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1200));
const has = await page.evaluate(() => ({
  studio: /THEME STUDIO/.test(document.body.innerText),
  oldGrid: /PASTEL DREAMY/.test(document.body.innerText),
  godEater: /GOD EATER/.test(document.body.innerText),
}));
console.log(JSON.stringify(has));
// open the studio from settings
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /OPEN STUDIO/.test(x.textContent ?? ""));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1100));
const open = await page.evaluate(() => /THEME STUDIO/.test(document.body.innerText) && document.querySelectorAll("button").length > 20);
console.log("studio opens from settings:", open);
await page.screenshot({ path: "qa-shots/26-settings-studio.png" });
await page.evaluate(() => window.__atori.useUi.getState().setThemeStudioOpen(false));
await browser.disconnect();
