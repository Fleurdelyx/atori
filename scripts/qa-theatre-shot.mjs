import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let page = (await browser.pages())[0];
for (const t of await browser.pages()) { const u = await t.url(); if (u.includes("localhost") || u.includes("tauri")) page = t; }
await page.evaluate(() => window.__atori.useUi.getState().setNowPlayingOpen(true));
await new Promise((r) => setTimeout(r, 900));
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /THEATRE/.test(x.textContent ?? ""));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1500));
const m = await page.evaluate(() => {
  const btn = document.querySelector('[data-testid="np-controls"]');
  if (!btn) return { found: false };
  const play = [...btn.querySelectorAll("button")].find((b) => ["Play", "Pause"].includes(b.getAttribute("aria-label") ?? ""));
  const pr = play.getBoundingClientRect();
  return {
    found: true,
    playCenter: Math.round(pr.x + pr.width / 2),
    windowCenter: Math.round(window.innerWidth / 2),
    theatreOn: /THEATRE ✓/.test(document.body.innerText),
  };
});
console.log(JSON.stringify(m));
await page.screenshot({ path: "qa-shots/28-theatre-centered.png" });
await browser.disconnect();
