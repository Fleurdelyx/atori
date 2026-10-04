import puppeteer from "puppeteer-core";
// sanity: app reachable, then capture the native window from PowerShell
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let page = (await browser.pages())[0];
for (const t of await browser.pages()) { const u = await t.url(); if (u.includes("localhost") || u.includes("tauri")) page = t; }
await page.evaluate(() => window.__atori.useUi.getState().setNowPlayingOpen(false));
await browser.disconnect();
