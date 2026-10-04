/**
 * Context-menu suppression check: dispatches a real trusted right-click
 * (CDP Input.dispatchMouseEvent, the same path as a physical mouse) and
 * asserts the contextmenu event is defaultPrevented (native menu suppressed)
 * while the custom menu renders.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-ctxmenu.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: await mkdtemp(join(tmpdir(), "atori-ctx-")),
  args: ["--no-first-run", "--mute-audio"],
  defaultViewport: { width: 1400, height: 880 },
});
const page = await browser.newPage();
await page.goto(`${process.env.QA_BASE ?? "http://127.0.0.1:1431"}/?demo`, { waitUntil: "domcontentloaded" });
await sleep(8500);

// arm a probe that records the trusted contextmenu event (capture: the app
// legitimately stopPropagation()s, so window-bubble never sees it; reading
// defaultPrevented AFTER dispatch reflects the app's preventDefault call)
await page.evaluate(() => {
  window.__ctxEvent = null;
  window.addEventListener(
    "contextmenu",
    (e) => {
      window.__ctxEvent = e;
    },
    { capture: true, once: true },
  );
});

// navigate to LIBRARY → TRACKS so a row is right-clickable
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button, a")].find((x) => /^LIBRARY/i.test((x.textContent ?? "").trim()));
  if (b) b.click();
});
await sleep(1000);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /^TRACKS/i.test((x.textContent ?? "").trim()));
  if (b) b.click();
});
await sleep(800);

const row = await page.evaluate(() => {
  const r = document.querySelector('div[role="button"].track-row');
  if (!r) return null;
  const b = r.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});
if (!row) throw new Error("no track row to right-click");

const client = await page.createCDPSession();
await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: row.x, y: row.y, button: "right", clickCount: 1 });
await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: row.x, y: row.y, button: "right", clickCount: 1 });
await sleep(900);

const result = await page.evaluate(() => ({
  prevented: window.__ctxEvent ? window.__ctxEvent.defaultPrevented : null,
  customMenu: /Play now|Delete from library/.test(document.body.innerText),
}));
console.log(JSON.stringify(result));
if (result.prevented !== true) throw new Error("contextmenu event was NOT defaultPrevented: native menu will show");
if (!result.customMenu) throw new Error("custom menu did not render");
console.log("CONTEXT MENU SUPPRESSION PASS");
await browser.close();
process.exit(0);
