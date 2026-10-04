import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

await page.goto("http://127.0.0.1:1430/", { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 3000));

// collapse, then grab mid-flight and settled frames
await page.evaluate(() => {
  const b = document.querySelector('button[aria-label="Collapse sidebar"]');
  b?.click();
});
await new Promise((r) => setTimeout(r, 130));
const nav = await page.$("nav");
await nav?.screenshot({ path: "qa-shots/rail-anim-mid-collapse.png" });
await new Promise((r) => setTimeout(r, 700));
await nav?.screenshot({ path: "qa-shots/rail-anim-collapsed.png" });

// expand: catch the stagger mid-reveal
await page.evaluate(() => {
  const b = document.querySelector('button[aria-label="Expand sidebar"]');
  b?.click();
});
await new Promise((r) => setTimeout(r, 160));
await nav?.screenshot({ path: "qa-shots/rail-anim-mid-expand.png" });
await new Promise((r) => setTimeout(r, 900));
await nav?.screenshot({ path: "qa-shots/rail-anim-expanded.png" });

// settled geometry sanity
const settled = await page.evaluate(() => {
  const navEl = document.querySelector("nav");
  const labels = [...document.querySelectorAll("nav button span span")].filter((s) =>
    ["HOME", "LIBRARY", "CLOUD", "CATALOGUE", "SETTINGS"].includes((s.textContent ?? "").trim()),
  );
  return {
    width: Math.round(navEl?.getBoundingClientRect().width ?? 0),
    labelsVisible: labels.filter((s) => getComputedStyle(s.closest("span")?.parentElement ?? s).opacity === "1").length,
  };
});
console.log(JSON.stringify({ settled, pageErrors: errors }));
await browser.close();
