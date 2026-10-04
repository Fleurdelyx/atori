/**
 * Rail + fallback context menus: dispatches real trusted right-clicks
 * (CDP Input.dispatchMouseEvent) and asserts:
 *   1. rail playlist row  → custom playlist menu (native menu suppressed)
 *   2. rail header/empty  → custom sidebar menu (New playlist / Import)
 *   3. clicking "New playlist" opens the create dialog
 *   4. right-click in a text field → custom clipboard menu (Paste)
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-railmenu.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: await mkdtemp(join(tmpdir(), "atori-rail-")),
  args: ["--no-first-run", "--mute-audio"],
  defaultViewport: { width: 1400, height: 880 },
});
const page = await browser.newPage();
await page.goto(`${process.env.QA_BASE ?? "http://127.0.0.1:1431"}/?demo`, { waitUntil: "domcontentloaded" });
await sleep(8500);

// probe that records the trusted contextmenu event (capture: the app
// legitimately stopPropagation()s; defaultPrevented is read AFTER dispatch)
const armProbe = () =>
  page.evaluate(() => {
    window.__ctxEvent = null;
    window.addEventListener(
      "contextmenu",
      (e) => {
        window.__ctxEvent = e;
      },
      { capture: true, once: true },
    );
  });

const rightClick = async (pos) => {
  await armProbe();
  const client = await page.createCDPSession();
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pos.x, y: pos.y, button: "right", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pos.x, y: pos.y, button: "right", clickCount: 1 });
  await sleep(700);
};

const escapeMenu = async () => {
  await page.keyboard.press("Escape");
  await sleep(300);
};

// seed a playlist so the rail shows a row
await page.evaluate(async () => {
  await window.__atori.db.playlists.add({ name: "QA Rail", trackIds: [], createdAt: Date.now() });
});
await sleep(800);

// ---- 1. rail playlist row → playlist menu ---------------------------------
const row = await page.evaluate(() => {
  const b = [...document.querySelectorAll("nav button")].find((x) => /QA Rail/.test(x.textContent ?? ""));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (!row) throw new Error("rail playlist row not found");
await rightClick(row);

let result = await page.evaluate(() => ({
  prevented: window.__ctxEvent ? window.__ctxEvent.defaultPrevented : null,
  menu: /Play playlist/.test(document.body.innerText) && /Delete playlist/.test(document.body.innerText),
}));
console.log("row menu:", JSON.stringify(result));
if (result.prevented !== true) throw new Error("row contextmenu NOT defaultPrevented: native menu will show");
if (!result.menu) throw new Error("playlist menu did not render");
await escapeMenu();

// ---- 2. rail header → sidebar menu ----------------------------------------
const header = await page.evaluate(() => {
  const s = [...document.querySelectorAll("nav span")].find((x) => /PLAYLISTS/.test(x.textContent ?? ""));
  if (!s) return null;
  const r = s.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (!header) throw new Error("rail header not found");
await rightClick(header);

result = await page.evaluate(() => ({
  prevented: window.__ctxEvent ? window.__ctxEvent.defaultPrevented : null,
  menu: /New playlist/.test(document.body.innerText) && /Import music folder/.test(document.body.innerText),
}));
console.log("sidebar menu:", JSON.stringify(result));
if (result.prevented !== true) throw new Error("sidebar contextmenu NOT defaultPrevented");
if (!result.menu) throw new Error("sidebar menu did not render");

// ---- 3. click "New playlist" → create dialog ------------------------------
const item = await page.evaluate(() => {
  const b = [...document.querySelectorAll("[data-atori-ctxmenu] button")].find((x) =>
    /^New playlist/.test((x.textContent ?? "").trim()),
  );
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (!item) throw new Error("New playlist menu item not found");
const client = await page.createCDPSession();
await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: item.x, y: item.y, button: "left", clickCount: 1 });
await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: item.x, y: item.y, button: "left", clickCount: 1 });
await sleep(700);
result = await page.evaluate(() => ({ dialog: /NEW PLAYLIST/.test(document.body.innerText) }));
console.log("create dialog:", JSON.stringify(result));
if (!result.dialog) throw new Error("playlist create dialog did not open");

// ---- 4. right-click in the dialog's text field → edit menu ----------------
const field = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll("input")];
  const inp = inputs.find((i) => i.getBoundingClientRect().width > 200 && i.type === "text");
  if (!inp) return null;
  const r = inp.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (!field) throw new Error("text field not found");
await rightClick(field);

result = await page.evaluate(() => ({
  prevented: window.__ctxEvent ? window.__ctxEvent.defaultPrevented : null,
  menu: /Paste/.test(document.body.innerText),
}));
console.log("edit menu:", JSON.stringify(result));
if (result.prevented !== true) throw new Error("field contextmenu NOT defaultPrevented");
if (!result.menu) throw new Error("edit menu did not render");

console.log("RAIL MENU PASS");
await browser.close();
process.exit(0);
