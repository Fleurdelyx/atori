import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let page = (await browser.pages())[0];
for (const t of await browser.pages()) { const u = await t.url(); if (u.includes("localhost") || u.includes("tauri")) page = t; }
await page.evaluate(() => {
  window.__atori.useUi.getState().setQueueOpen(true);
  window.__atori.useUi.getState().setNowPlayingOpen(false);
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: "qa-shots/29-phonograph-fixed.png" });
const check = await page.evaluate(() => {
  const title = [...document.querySelectorAll("div")].find((d) => d.textContent?.includes("Girl's Last Tour") && d.className.includes("truncate") && (d.className.includes("text-[clamp") || d.className.includes("uppercase")));
  return { titleVisible: !!title, hasOverflowX: document.documentElement.scrollWidth > window.innerWidth };
});
console.log(JSON.stringify(check));
await browser.disconnect();
