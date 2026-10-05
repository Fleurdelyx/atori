import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = process.env.PROBE_URL ?? "http://127.0.0.1:1431/";

async function run(label, viewport) {
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: "new",
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(BASE + "?demo", { waitUntil: "networkidle2", timeout: 45000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle2" });
  await page.evaluate(() => {
    localStorage.setItem("atori-ui", JSON.stringify({ state: { cloudSetupDone: true, offlineMode: false, catalogueEnabled: true }, version: 0 }));
  });
  await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
  await page.waitForFunction(() => window.__atori?.db, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  const out = await page.evaluate(async () => {
    const { engine, audioLevels, db } = window.__atori;
    const tracks = await db.tracks.limit(2).toArray();
    await engine.playQueue(tracks, 0);
    await new Promise((r) => setTimeout(r, 1800));
    const b1 = audioLevels.bass;
    await new Promise((r) => setTimeout(r, 700));
    return {
      analyser: audioLevels.analyser != null,
      synth: audioLevels.synthetic != null,
      audible: engine.el ? !engine.el.paused : false,
      bassMoving: Math.abs(audioLevels.bass - b1) > 0.001 || audioLevels.bass > 0,
      bass: Number(audioLevels.bass.toFixed(3)),
    };
  });
  console.log(label, JSON.stringify(out));
  await browser.close();
}

await run("MOBILE", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await run("DESKTOP", { width: 1280, height: 860, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
