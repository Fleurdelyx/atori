import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let page = (await browser.pages())[0];
for (const t of await browser.pages()) { const u = await t.url(); if (u.includes("localhost") || u.includes("tauri")) page = t; }

const before = await page.evaluate(() => {
  const ui = window.__atori.useUi.getState();
  return { np: ui.nowPlayingOpen, repeat: window.__atori.engine.repeat };
});
await page.evaluate(() => {
  window.__atori.useUi.getState().setNowPlayingOpen(true);
  window.__atori.engine.setRepeat("one");
});
await new Promise((r) => setTimeout(r, 800));

const flatHandle = await page.evaluateHandle(() =>
  [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("FLAT")),
);
if (flatHandle.asElement()) {
  await flatHandle.asElement().hover();
  await new Promise((r) => setTimeout(r, 450));
}
await page.screenshot({ path: "qa-shots/probe-pill-hover.png" });

await page.evaluate((b) => {
  window.__atori.engine.setRepeat(b.repeat);
  window.__atori.useUi.getState().setNowPlayingOpen(b.np);
}, before);
console.log("OK repeat=" + before.repeat);
await browser.disconnect();
