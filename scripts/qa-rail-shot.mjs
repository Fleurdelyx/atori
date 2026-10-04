/** Screenshot the new rail menus (sidebar + playlist row). */
import puppeteer from "puppeteer-core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: await mkdtemp(join(tmpdir(), "atori-shot-")),
  args: ["--no-first-run", "--mute-audio"],
  defaultViewport: { width: 1400, height: 880 },
});
const page = await browser.newPage();
await page.goto(`${process.env.QA_BASE ?? "http://127.0.0.1:1431"}/?demo`, { waitUntil: "domcontentloaded" });
await sleep(8500);
await page.evaluate(async () => {
  await window.__atori.db.playlists.add({ name: "QA Rail", trackIds: [], createdAt: Date.now() });
});
await sleep(800);
const click = async (pos, button = "right") => {
  const client = await page.createCDPSession();
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pos.x, y: pos.y, button, clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pos.x, y: pos.y, button, clickCount: 1 });
  await sleep(700);
};
const header = await page.evaluate(() => {
  const s = [...document.querySelectorAll("nav span")].find((x) => /PLAYLISTS/.test(x.textContent ?? ""));
  const r = s.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await click(header);
await page.screenshot({ path: "qa-shots/rail-sidebar-menu.png" });
await page.keyboard.press("Escape");
await sleep(300);
const row = await page.evaluate(() => {
  const b = [...document.querySelectorAll("nav button")].find((x) => /QA Rail/.test(x.textContent ?? ""));
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await click(row);
await page.screenshot({ path: "qa-shots/rail-row-menu.png" });
await browser.close();
console.log("shots saved");
