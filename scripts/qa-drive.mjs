/**
 * QA driver: boots the web build in headless Edge against the dev server,
 * walks the main surfaces, captures console/page errors, failed requests,
 * and screenshots at each stop.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-drive.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:1431";
const OUT = "qa-shots";
await mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = await mkdtemp(join(tmpdir(), "atori-qa-"));
const browser = await puppeteer.launch({
  executablePath: process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: profile,
  args: ["--no-first-run", "--mute-audio", "--window-size=1400,880"],
  defaultViewport: { width: 1400, height: 880 },
});

const problems = [];
const seen = { console: [], pageerr: [], reqfail: [] };
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") seen.console.push(m.text().slice(0, 260));
});
page.on("pageerror", (e) => seen.pageerr.push(String(e).slice(0, 260)));
page.on("requestfailed", (r) => {
  const u = r.url();
  if (u.startsWith(BASE)) seen.reqfail.push(`${r.failure()?.errorText ?? "?"} ${u.slice(0, 120)}`);
});

const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${String(e).slice(0, 240)}`);
    console.log(`FAIL ${name}: ${String(e).slice(0, 240)}`);
  }
};
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });
const bodyText = () => page.evaluate(() => document.body.innerText);
const clickFirst = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.click();
    return true;
  }, sel);

await step("boot", async () => {
  await page.goto(`${BASE}/?demo`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(9000); // boot animation + demo import
  const txt = await bodyText();
  if (!txt || /refused to connect/i.test(txt)) throw new Error("blank page");
  await shot("01-home");
});

await step("home-content", async () => {
  const txt = await bodyText();
  if (!/RECENTLY ADDED/i.test(txt)) throw new Error(`home rows missing; got: ${txt.slice(0, 160)}`);
});

await step("play-a-track", async () => {
  // fresh profile has no play history: Home shows only album cards, so
  // route to the Library → TRACKS tab first
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button, a")].find((x) => /^LIBRARY/i.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(1000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^TRACKS/i.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(1000);
  const ok = await clickFirst('div[role="button"].track-row');
  if (!ok) throw new Error("no track row");
  await sleep(2500);
  const t1 = await bodyText().then((t) => /\d+:\d\d\s*\/\s*\d+:\d\d/.test(t) || /\d+:\d\d/.test(t));
  if (!t1) throw new Error("no time readout after play");
});

await step("mini-player-progresses", async () => {
  const read = () => page.evaluate(() => document.querySelector("footer")?.innerText.match(/\d+:\d\d/)?.[0] ?? "?");
  const a = await read();
  await sleep(2500);
  const b = await read();
  if (a === b) throw new Error(`position frozen at ${a}`);
});

await step("open-now-playing", async () => {
  const ok = await clickFirst("footer button");
  if (!ok) throw new Error("no footer button");
  await sleep(1200);
  const txt = await bodyText();
  if (!/NOW PLAYING/i.test(txt)) throw new Error("now playing overlay missing");
  await shot("02-nowplaying");
});

await step("np-controls", async () => {
  const has = await page.evaluate(() => !!document.querySelector('[data-testid="np-controls"]'));
  if (!has) throw new Error("np controls missing");
});

await step("seekbar-drag", async () => {
  const handle = await page.evaluate(() => {
    // the seek bar row: relative h-6 cursor-pointer group
    const bar = [...document.querySelectorAll("div")].find(
      (d) => d.className.includes("cursor-pointer") && d.className.includes("h-6") && d.className.includes("group"),
    );
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    return { x: r.x, y: r.y + r.height / 2, w: r.width };
  });
  if (!handle) throw new Error("seek bar not found");
  const read = () => page.evaluate(() => document.querySelector("footer")?.innerText.match(/\d+:\d\d/)?.[0] ?? "?");
  const before = await read();
  await page.mouse.move(handle.x + handle.w * 0.02, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.w * 0.85, handle.y, { steps: 12 });
  await page.mouse.up();
  await sleep(1500);
  const after = await read();
  if (before === after) throw new Error("seek did not change position");
  await shot("03-after-seek");
});

await step("diamond-follows-playback", async () => {
  const pos = await page.evaluate(() => {
    const handle = [...document.querySelectorAll("div")].find((d) => {
      const st = d.getAttribute("style") ?? "";
      return d.className.includes("rotate-45") && /left:\s*[\d.]+%/.test(st);
    });
    return handle?.getAttribute("style")?.match(/left:\s*([\d.]+)%/)?.[1] ?? null;
  });
  const pct = Number(pos);
  if (pos === null || Number.isNaN(pct) || pct < 50) throw new Error(`diamond at ${pos}% after seeking to 85%`);
});

await step("close-now-playing", async () => {
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /CLOSE/i.test(x.textContent ?? ""));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!ok) throw new Error("no CLOSE button");
  await sleep(900);
});

await step("mini-lyrics-panel", async () => {
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll("footer button")].find((x) => (x.getAttribute("aria-label") ?? "") === "Toggle lyrics");
    if (b) { b.click(); return true; }
    return false;
  });
  if (!ok) throw new Error("lyrics button missing");
  await sleep(700);
  const txt = await page.evaluate(() => document.querySelector("footer")?.parentElement?.innerText ?? "");
  if (!/LYRICS|歌詞|No lyrics/i.test(txt)) throw new Error("lyrics panel did not open");
  await shot("04-lyrics");
  await page.keyboard.press("Escape");
  await sleep(600);
  const closed = await page.evaluate(() => !document.querySelector("footer")?.innerText.includes("LYRICS"));
  if (!closed) throw new Error("lyrics panel did not close on Escape");
});

await step("queue-escape-closes", async () => {
  const open = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") ?? "") === "Open queue");
    if (b) { b.click(); return true; }
    return false;
  });
  if (!open) throw new Error("queue button missing");
  await sleep(700);
  await page.keyboard.press("Escape");
  await sleep(600);
  const gone = await page.evaluate(() => !/UP NEXT/i.test(document.body.innerText));
  if (!gone) throw new Error("queue panel did not close on Escape");
});

await step("context-menu-delete-item", async () => {
  const row = await page.$('div[role="button"].track-row');
  if (!row) throw new Error("no track row for context menu");
  await row.click({ button: "right" });
  await sleep(700);
  const txt = await bodyText();
  if (!/Delete from library/i.test(txt)) throw new Error("delete menu item missing");
  await shot("05-context-menu");
});

await step("delete-demo-track", async () => {
  const count = await page.evaluate(
    () => document.querySelectorAll('div[role="button"].track-row').length,
  );
  // open the menu and click the item in ONE step: the menu can't survive
  // across steps (any stray focus loss dismisses it)
  const opened = await page.evaluate(() => {
    const row = document.querySelector('div[role="button"].track-row');
    if (!row) return false;
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    return true;
  });
  if (!opened) throw Error("no track row");
  await sleep(600);
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Delete from library/i.test(x.textContent ?? ""));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!clicked) throw new Error("delete item vanished before click");
  await sleep(1200);
  const after = await page.evaluate(
    () => document.querySelectorAll('div[role="button"].track-row').length,
  );
  if (after >= count) throw new Error(`track count unchanged (${count} → ${after})`);
});

await step("queue-panel", async () => {
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") ?? "") === "Open queue");
    if (b) { b.click(); return true; }
    return false;
  });
  if (!ok) throw new Error("queue button missing");
  await sleep(800);
  await shot("06-queue");
  await page.keyboard.press("Escape");
  await sleep(400);
});

await step("command-palette", async () => {
  await page.keyboard.down("Control");
  await page.keyboard.press("k");
  await page.keyboard.up("Control");
  await sleep(700);
  await shot("07-palette");
  await page.keyboard.press("Escape");
});

await step("library-screen", async () => {
  // already on LIBRARY from the playback step: verify it still renders
  await sleep(600);
  const txt = await bodyText();
  if (!/TRACKS/i.test(txt)) throw new Error("library list missing");
  await shot("08-library");
});

await step("cloud-screen", async () => {
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button, a")].find((x) => /CLOUD/i.test(x.textContent ?? ""));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!ok) throw new Error("cloud nav missing");
  await sleep(1200);
  await shot("09-cloud");
});

await step("settings-screen", async () => {
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button, a")].find((x) => /SETTINGS/i.test(x.textContent ?? ""));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!ok) throw new Error("settings nav missing");
  await sleep(1000);
  await shot("10-settings");
});

console.log("\n--- console errors:", seen.console.length);
for (const e of [...new Set(seen.console)].slice(0, 10)) console.log("  console:", e);
console.log("--- page errors:", seen.pageerr.length);
for (const e of [...new Set(seen.pageerr)].slice(0, 10)) console.log("  pageerror:", e);
console.log("--- failed requests:", seen.reqfail.length);
for (const e of [...new Set(seen.reqfail)].slice(0, 10)) console.log("  reqfail:", e);
console.log("--- step failures:", problems.length);
for (const p of problems) console.log("  step:", p);

await browser.close();
process.exit(problems.length === 0 && seen.pageerr.length === 0 ? 0 : 1);
