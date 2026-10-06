import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = "http://127.0.0.1:1431/";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
await page.goto(BASE + "?demo", { waitUntil: "networkidle2", timeout: 45000 });
await page.evaluate(() => {
  localStorage.clear();
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
});
await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 5000)); // boot + catalogue pull

const bodyHas = (t) => page.evaluate((x) => document.body.innerText.includes(x), t);

// 1. a catalogue-only song is NOT in the merged library tracks
await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await new Promise((r) => setTimeout(r, 1500));
const inLibrary = await bodyHas("As the World Caves In");
console.log("1. catalogue song in LIBRARY tracks (expect false):", inLibrary);

// 2. the CATALOGUE screen still lists it
await page.evaluate(() => {
  document.querySelector('nav button[aria-label="CATALOGUE"]').click();
});
await new Promise((r) => setTimeout(r, 4000));
const inCatalogue = await bodyHas("As the World Caves In");
console.log("2. catalogue song in CATALOGUE screen (expect true):", inCatalogue);

// 3. like it from its catalogue row (long-press menu) -> it joins the library
await page.evaluate(() => {
  const rows = [...document.querySelectorAll("main div[role='button']")];
  const row = rows.find((n) => (n.textContent ?? "").includes("As the World Caves In"));
  const r = row.getBoundingClientRect();
  row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 60, clientY: r.top + 20 }));
});
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const item = [...document.querySelectorAll("[data-atori-ctxmenu] button")].find((b) => (b.textContent ?? "").trim().startsWith("Like"));
  item?.click();
});
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  document.querySelector('nav button[aria-label="LIBRARY"]').click();
});
await new Promise((r) => setTimeout(r, 1500));
const likedInLibrary = await bodyHas("As the World Caves In");
console.log("3. liked catalogue song in LIBRARY tracks (expect true):", likedInLibrary);

// 4. the CATALOGUE scope still lists every shared track
await page.evaluate(() => {
  const scope = [...document.querySelectorAll("main button")].find((b) => (b.textContent ?? "").trim() === "CATALOGUE");
  scope?.click();
});
await new Promise((r) => setTimeout(r, 900));
const scopeRows = await page.evaluate(() => document.querySelectorAll("main .track-row").length);
console.log("4. CATALOGUE scope row count (expect 13):", scopeRows);

// 5. unlike again: it leaves the library view
await page.evaluate(async () => {
  // favorites persist under "atori-favs": clear + refresh for the unlike leg
  localStorage.setItem("atori-favs", JSON.stringify({ state: { keys: [] }, version: 0 }));
});
await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await new Promise((r) => setTimeout(r, 1500));
const goneAfterUnlike = await bodyHas("As the World Caves In");
console.log("5. unliked catalogue song gone from LIBRARY (expect false):", goneAfterUnlike);

console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "none");
await browser.close();
