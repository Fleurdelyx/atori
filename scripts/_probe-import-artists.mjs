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
});
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3000));

// 1. IMPORT on a phone opens the plain multi-file input (not the dead folder input)
await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await new Promise((r) => setTimeout(r, 1200));
const opened = await page.evaluate(
  () =>
    new Promise((res) => {
      // real phones lack showDirectoryPicker entirely: simulate that so the
      // touch fallback branch runs (desktop Chrome keeps the API, emulator too)
      delete window.showDirectoryPicker;
      const inputs = [...document.querySelectorAll('input[type="file"][multiple]')];
      const plain = inputs.find((i) => !i.hasAttribute("webkitdirectory"));
      if (!plain) return res("NO PLAIN INPUT");
      plain.addEventListener("click", () => res("chooser"), { once: true });
      setTimeout(() => res("none"), 3000);
      [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("IMPORT")).click();
    }),
);
console.log("MOBILE IMPORT ->", opened);

// 2. multi-artist track: the row shows every comma-separated artist
await page.evaluate(async () => {
  const { db } = window.__atori;
  const t = await db.tracks.limit(1).toArray();
  await db.tracks.update(t[0].id, { artist: "Hatsune Miku", artists: ["Hatsune Miku", "Megurine Luka"] });
});
await new Promise((r) => setTimeout(r, 1200));
const rowText = await page.evaluate(() => document.querySelector(".track-row")?.textContent ?? "");
console.log("ROW ARTISTS:", rowText.includes("Hatsune Miku") && rowText.includes("Megurine Luka") ? "both shown OK" : JSON.stringify(rowText.slice(0, 120)));

// 3. fullwidth comma splits on save
const saved = await page.evaluate(async () => {
  const { db } = window.__atori;
  const t = (await db.tracks.limit(1).toArray())[0];
  const list = t.artists.join("，"); // fullwidth comma, CJK IME style
  const split = list.split(/[,、，]/).map((s) => s.trim()).filter(Boolean);
  return { list, split };
});
console.log("FULLWIDTH SPLIT:", JSON.stringify(saved));
console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "none");
await browser.close();
