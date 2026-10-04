import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let page = (await browser.pages())[0];
for (const t of await browser.pages()) { const u = await t.url(); if (u.includes("localhost") || u.includes("tauri")) page = t; }
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button, a")].find((x) => /^LIBRARY/i.test((x.textContent ?? "").trim()));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: "qa-shots/27-controls-centered.png" });
console.log("shot saved");
await browser.disconnect();
