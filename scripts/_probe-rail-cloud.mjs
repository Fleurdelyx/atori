import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = process.env.PROBE_URL ?? "http://127.0.0.1:1430/";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("button", { timeout: 30000 });
await page.evaluate(() => {
  localStorage.setItem(
    "atori-ui",
    JSON.stringify({ state: { cloudSetupDone: true, offlineMode: false, catalogueEnabled: true }, version: 0 }),
  );
  localStorage.setItem(
    "atori-auth",
    JSON.stringify({
      state: { serverUrl: "https://atori-cloud.atori-server.workers.dev", sessionToken: "", user: null },
      version: 0,
    }),
  );
  // the device's own mirrors must NOT render (local rows cover them);
  // foreign mirrors and user-created cloud playlists must render
  localStorage.setItem(
    "atori-playlists",
    JSON.stringify({
      state: {
        playlists: [
          { id: "lp_local1-9", name: "Own Mirror", trackKeys: [], updatedAt: 1 },
          { id: "lp_zzz999-4", name: "Faves", trackKeys: [], updatedAt: 2 },
          { id: "p_usermix", name: "Cloud Mix", trackKeys: [], updatedAt: 3 },
        ],
      },
      version: 0,
    }),
  );
  localStorage.setItem("atori-origin", "local1");
});
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("button", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));

const rail = await page.evaluate(() => {
  const text = document.body.textContent;
  return {
    ownMirror: text.includes("Own Mirror"),
    foreignMirror: text.includes("Faves"),
    userCloud: text.includes("Cloud Mix"),
  };
});
await page.screenshot({ path: "qa-shots/probe-rail-cloud.png" });

// click a cloud rail row: must land on LIBRARY > PLAYLISTS > CLOUD scope, focused
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => (b.getAttribute("title") ?? "") === "Cloud Mix").click();
});
await new Promise((r) => setTimeout(r, 1500));
const landed = await page.evaluate(() => {
  const text = document.body.textContent;
  return {
    library: text.includes("LIBRARY"),
    scopeCloud: !!document.querySelector("button") && text.includes("CLOUD クラウド") === false && text.includes("CLOUD"),
    detail: text.includes("CLOUD // SYNCED TO YOUR ACCOUNT") || text.includes("TRACKS · CLOUD"),
  };
});
console.log("RAIL:", JSON.stringify(rail));
console.log("LANDED:", JSON.stringify(landed));
console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "none");
await browser.close();
