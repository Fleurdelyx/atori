import puppeteer from "puppeteer-core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = "http://127.0.0.1:1431/";
const dir = await mkdtemp(join(tmpdir(), "fxprobe-"));

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 860 });
const logs = [];
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 220)}`);
});
page.on("pageerror", (e) => logs.push(`pageerror: ${String(e).slice(0, 220)}`));
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

const seed = (extra) =>
  page.evaluate((extra) => {
    localStorage.clear();
    const ui = JSON.parse(localStorage.getItem("atori-ui") ?? "{}");
    localStorage.setItem(
      "atori-ui",
      JSON.stringify({ state: { cloudSetupDone: true, offlineMode: false, catalogueEnabled: true, ...extra }, version: 0 }),
    );
  }, extra);

// frame-difference metric over the wallpaper region (top strip above the panel)
const motion = async () => {
  const a = await page.screenshot({ clip: { x: 700, y: 40, width: 500, height: 120 } });
  await new Promise((r) => setTimeout(r, 1200));
  const b = await page.screenshot({ clip: { x: 700, y: 40, width: 500, height: 120 } });
  let diff = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 97) diff += Math.abs(a[i] - b[i]);
  return Math.round(diff / (n / 97));
};

await page.goto(BASE + "?demo", { waitUntil: "networkidle2", timeout: 45000 });
await seed({ skinId: "soft-pink", bgStyle: "slabs" });
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3500));
console.log("A (no accent):", await motion());
await page.screenshot({ path: `${dir}/A-no-accent.png` });

// apply an accent the way ThemeStudio does, live (no reload)
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
});
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => {
  const input = document.querySelector('input[placeholder="SEARCH ・ 検索…"]');
  input?.blur();
  window.__atori.useUi.getState().setThemeStudioOpen(true);
});
await new Promise((r) => setTimeout(r, 900));
await page.evaluate(() => window.__atori.useUi.getState().setAccentOverride("#ff6ec7"));
await new Promise((r) => setTimeout(r, 1200));
console.log("B (live accent):", await motion());
await page.screenshot({ path: `${dir}/B-live-accent.png` });

// reload with the persisted accent: does FX come back at boot?
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3500));
console.log("C (accent at boot):", await motion());
await page.screenshot({ path: `${dir}/C-boot-accent.png` });

// canvas + context state
console.log(
  "STATE:",
  await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return "NO CANVAS";
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    return {
      w: c.width,
      h: c.height,
      lost: gl ? gl.isContextLost() : "n/a",
      accent: getComputedStyle(document.documentElement).getPropertyValue("--ato-accent").trim(),
    };
  }),
);
console.log("CONSOLE:", logs.length ? logs.slice(-8).join("\n") : "clean");
await browser.close();
