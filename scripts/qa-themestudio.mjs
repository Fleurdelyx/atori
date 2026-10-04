import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let page = (await browser.pages())[0];
for (const t of await browser.pages()) { const u = await t.url(); if (u.includes("localhost") || u.includes("tauri")) page = t; }
// open the studio from the rail
await page.evaluate(() => {
  const b = [...document.querySelectorAll("nav button")].find((x) => /SKIN:/.test(x.textContent ?? ""));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: "qa-shots/25-theme-studio.png" });
// apply a light skin via card click and verify tokens changed
await page.evaluate(() => {
  const card = [...document.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === "SOFT POP");
  if (card) card.click();
});
await new Promise((r) => setTimeout(r, 900));
const afterSkin = await page.evaluate(() => ({
  skin: window.__atori.useUi.getState().skinId,
  accent: getComputedStyle(document.documentElement).getPropertyValue("--ato-accent").trim(),
}));
// pick a swatch accent
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === "Accent #47e0d2");
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 600));
const afterAccent = await page.evaluate(() => ({
  override: window.__atori.useUi.getState().accentOverride,
  accent: getComputedStyle(document.documentElement).getPropertyValue("--ato-accent").trim(),
}));
console.log(JSON.stringify({ afterSkin, afterAccent }, null, 2));
// reset: default skin + default accent
await page.evaluate(() => {
  window.__atori.useUi.getState().setAccentOverride(null);
  window.__atori.useUi.getState().setSkin("neon-gacha");
  window.__atori.useUi.getState().setThemeStudioOpen(false);
});
await new Promise((r) => setTimeout(r, 700));
const reset = await page.evaluate(() => ({
  skin: window.__atori.useUi.getState().skinId,
  override: window.__atori.useUi.getState().accentOverride,
  accent: getComputedStyle(document.documentElement).getPropertyValue("--ato-accent").trim(),
}));
console.log(JSON.stringify(reset));
await browser.disconnect();
