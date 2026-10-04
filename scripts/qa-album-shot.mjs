import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let page = (await browser.pages())[0];
for (const t of await browser.pages()) { const u = await t.url(); if (u.includes("localhost") || u.includes("tauri")) page = t; }
await page.evaluate(async () => {
  const { db } = window.__atori;
  const t = await db.tracks.where("title").equals("escape").first();
  if (t) window.__atori.useUi.getState().navigate("album", `${t.album}::${t.albumArtist}`, t.source ?? "local");
  window.__atori.useUi.getState().setNowPlayingOpen(false);
  window.__atori.useUi.getState().setQueueOpen(false);
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: "qa-shots/30-album-back.png" });
await browser.disconnect();
