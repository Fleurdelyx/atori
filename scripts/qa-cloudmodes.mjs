/**
 * Connection-modes QA: the first-run chooser (default hidden when no
 * DEFAULT_SERVER_URL), the offline flow (choose offline → cloud off →
 * GO ONLINE → chooser returns), and persistence across reload.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-cloudmodes.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:1431";
await mkdir("qa-shots", { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: await mkdtemp(join(tmpdir(), "atori-mode-")),
  args: ["--no-first-run", "--mute-audio"],
  defaultViewport: { width: 1400, height: 880 },
});
const page = await browser.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${String(e).slice(0, 240)}`);
    console.log(`FAIL ${name}: ${String(e).slice(0, 240)}`);
  }
};
const shot = (name) => page.screenshot({ path: join("qa-shots", `${name}.png`) });
const gotoCloud = async () => {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button, a")].find((x) => /^CLOUD/i.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(900);
};

await step("boot", async () => {
  await page.goto(`${BASE}/?demo`, { waitUntil: "domcontentloaded" });
  await sleep(8500);
  if (!(await page.evaluate(() => !!window.__atori?.db))) throw new Error("dev hook missing");
});

await step("chooser-shown-first-run", async () => {
  await gotoCloud();
  const txt = await page.evaluate(() => document.body.innerText);
  if (!/HOW SHOULD ATORI CONNECT\?/.test(txt)) throw new Error("chooser card missing on first run");
  // DEFAULT_SERVER_URL is filled in defaults.ts → the default option must show
  if (!/USE ATORI CLOUD \(DEFAULT\)/.test(txt)) throw new Error("default option missing (is DEFAULT_SERVER_URL set?)");
  if (!/MY OWN SERVER/.test(txt) || !/WORK OFFLINE/.test(txt)) throw new Error("own-server/offline options missing");
  await shot("19-cloud-chooser");
});

await step("choose-offline", async () => {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /WORK OFFLINE/.test(x.textContent ?? ""));
    if (b) b.click();
  });
  await sleep(700);
  const st = await page.evaluate(() => ({
    offline: window.__atori.useUi.getState().offlineMode,
    done: window.__atori.useUi.getState().cloudSetupDone,
    banner: /OFFLINE MODE: PLAYING SAVED MUSIC ONLY/.test(document.body.innerText),
  }));
  if (!st.offline || !st.done || !st.banner) throw new Error(`offline state wrong: ${JSON.stringify(st)}`);
});

await step("offline-blocks-cloud", async () => {
  const st = await page.evaluate(() => ({
    configured: window.__atori.useUi.getState().offlineMode ? "n/a" : null,
    banner: true,
  }));
  void st;
  // cloudConfigured is module-side; verify via the visible UI: SYNC disabled
  const disabled = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /SYNC LIBRARY UP/.test(x.textContent ?? ""));
    return b ? b.disabled : null;
  });
  if (disabled !== true) throw new Error("SYNC LIBRARY UP not disabled in offline mode");
});

await step("offline-persists-reload", async () => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(6000);
  const st = await page.evaluate(() => window.__atori.useUi.getState().offlineMode);
  if (!st) throw new Error("offlineMode did not persist");
});

await step("go-online-restores-chooser", async () => {
  await gotoCloud();
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /GO ONLINE/.test(x.textContent ?? ""));
    if (b) b.click();
  });
  await sleep(700);
  const txt = await page.evaluate(() => document.body.innerText);
  if (!/HOW SHOULD ATORI CONNECT\?/.test(txt)) throw new Error("chooser did not return after GO ONLINE");
  await shot("20-chooser-returned");
});

await step("my-own-server-path", async () => {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /MY OWN SERVER/.test(x.textContent ?? ""));
    if (b) b.click();
  });
  await sleep(700);
  const st = await page.evaluate(() => ({
    view: window.__atori.useUi.getState().view,
    done: window.__atori.useUi.getState().cloudSetupDone,
  }));
  if (st.view !== "settings" || !st.done) throw new Error(`own-server path wrong: ${JSON.stringify(st)}`);
});

console.log(problems.length === 0 ? "\nCLOUD MODES QA PASS" : `\n${problems.length} PROBLEM(S):`);
for (const p of problems) console.log("  ", p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
