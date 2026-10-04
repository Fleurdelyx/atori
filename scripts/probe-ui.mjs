import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let page = (await browser.pages())[0];
for (const t of await browser.pages()) { const u = await t.url(); if (u.includes("localhost") || u.includes("tauri")) page = t; }
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button, a")].find((x) => /^LIBRARY/i.test((x.textContent ?? "").trim()));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1200));
const info = await page.evaluate(() => ({
  placeholder: document.querySelector("input[placeholder]")?.placeholder ?? null,
  trackRows: document.querySelectorAll(".track-row").length,
  mode: /MODE/.test(document.body.innerText),
  scope: /SCOPE/.test(document.body.innerText),
  rowText: document.body.innerText.slice(0, 120).replace(/\n/g, " | "),
}));
console.log(JSON.stringify(info, null, 2));
await browser.disconnect();
