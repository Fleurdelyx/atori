import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let page = (await browser.pages())[0];
for (const t of await browser.pages()) { const u = await t.url(); if (u.includes("localhost") || u.includes("tauri")) page = t; }
const m = await page.evaluate(() => {
  const btn = document.querySelector('[data-testid="np-controls"]');
  if (!btn) return { found: false };
  const cs = getComputedStyle(btn);
  const parent = btn.parentElement;
  const pcs = getComputedStyle(parent);
  const rect = btn.getBoundingClientRect();
  const prect = parent.getBoundingClientRect();
  const play = [...btn.querySelectorAll("button")].find((b) => ["Play", "Pause"].includes(b.getAttribute("aria-label") ?? ""));
  return {
    controlsRect: { x: Math.round(rect.x), w: Math.round(rect.width) },
    parentRect: { x: Math.round(prect.x), w: Math.round(prect.width) },
    parentDisplay: pcs.display,
    parentGridCols: pcs.gridTemplateColumns,
    controlsDisplay: cs.display,
    controlsW: cs.width,
    playCenter: play ? Math.round(play.getBoundingClientRect().x + play.getBoundingClientRect().width / 2) : null,
  };
});
console.log(JSON.stringify(m, null, 2));
await browser.disconnect();
