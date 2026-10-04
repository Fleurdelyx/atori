import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let page = (await browser.pages())[0];
for (const t of await browser.pages()) { const u = await t.url(); if (u.includes("localhost") || u.includes("tauri")) page = t; }

const before = await page.evaluate(() => {
  const ui = window.__atori.useUi.getState();
  return { np: ui.nowPlayingOpen, flat: ui.npFlat, hasTrack: !!window.__atori.engine.el.src };
});
if (!before.hasTrack) { console.log(JSON.stringify({ skip: "no current track in the live app" })); await browser.disconnect(); process.exit(0); }

await page.evaluate(() => {
  const ui = window.__atori.useUi.getState();
  ui.setNowPlayingOpen(true);
  ui.setNpFlat(true);
});
await new Promise((r) => setTimeout(r, 1200));

const m = await page.evaluate(() => {
  const row = document.querySelector("div.mt-7.flex.items-center.justify-center.gap-3");
  const spans = row ? [...row.querySelectorAll("span")] : [];
  const chip = spans[0];
  const text = spans[spans.length - 1];
  const r = (el) => {
    if (!el) return null;
    const { top, bottom } = el.getBoundingClientRect();
    return { top: +top.toFixed(1), bottom: +bottom.toFixed(1) };
  };
  const chipR = r(chip);
  const textR = r(text);
  const pill = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("THEATRE"));
  const pcs = pill ? pill.style : null;
  return {
    rowText: row?.textContent,
    chip: chipR,
    text: textR,
    centerDelta: chipR && textR ? +((chipR.top + chipR.bottom) / 2 - (textR.top + textR.bottom) / 2).toFixed(1) : null,
    pillStyle: pcs ? { border: pcs.border, color: pcs.color, background: pcs.background } : null,
  };
});
await page.screenshot({ path: "qa-shots/probe-flat-row.png" });

await page.evaluate((b) => {
  const ui = window.__atori.useUi.getState();
  ui.setNpFlat(b.flat);
  ui.setNowPlayingOpen(b.np);
}, before);
console.log(JSON.stringify(m, null, 2));
await browser.disconnect();
