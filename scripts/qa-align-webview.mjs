/**
 * Measure album-cell alignment INSIDE the desktop app's WebView2 (connects
 * over CDP to the real running window).
 *
 *   node scripts/qa-align-webview.mjs
 */
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const targets = await browser.pages();
let page = targets[0];
for (const t of targets) {
  const u = await t.url();
  if (u.includes("tauri.localhost") || u.includes("localhost")) page = t;
}
console.log("page:", await page.url());

await page.evaluate(() => {
  const b = [...document.querySelectorAll("button, a")].find((x) => /^LIBRARY/i.test((x.textContent ?? "").trim()));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /^TRACKS/i.test((x.textContent ?? "").trim()));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1000));

const data = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('div[role="button"].track-row')];
  const rowW = rows[0]?.getBoundingClientRect().width ?? 0;
  const template = rows[0] ? getComputedStyle(rows[0]).gridTemplateColumns : "";
  const xs = rows.slice(0, 20).map((r) => {
    const cells = [...r.children];
    const album = cells.find((c) => /md:block/.test(c.className));
    return album ? Math.round(album.getBoundingClientRect().x) : null;
  });
  const titles = rows.slice(0, 6).map((r) => r.textContent?.slice(0, 18));
  return { rowW, template, xs, titles };
});
console.log(JSON.stringify(data, null, 2));
const uniq = [...new Set(data.xs.filter((x) => x !== null))];
console.log(uniq.length <= 1 ? `ALIGNED: all at x=${uniq[0]}` : `MISALIGNED: ${uniq.length} distinct x: ${uniq.join(", ")}`);
await browser.disconnect();
process.exit(uniq.length <= 1 ? 0 : 1);
