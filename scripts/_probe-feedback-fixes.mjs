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
await page.setViewport({ width: 1280, height: 860 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(BASE + "?demo", { waitUntil: "networkidle2", timeout: 45000 });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem(
    "atori-ui",
    JSON.stringify({ state: { cloudSetupDone: true, offlineMode: false, catalogueEnabled: true, skinId: "soft-pink", bgStyle: "slabs" }, version: 0 }),
  );
});
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3000));

// 1. FX follows accent override
const before = await page.evaluate(() => window.__atori.useSkinStore.getState().skin.tokens["--ato-accent"]);
await page.evaluate(() => window.__atori.useUi.getState().setAccentOverride("#ff6ec7"));
await new Promise((r) => setTimeout(r, 400));
const after = await page.evaluate(() => window.__atori.useSkinStore.getState().skin.tokens["--ato-accent"]);
const css = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ato-accent").trim());
console.log("ACCENT skin token:", before, "->", after, "| css:", css, "|", before !== after && after === "#ff6ec7" && css === "#ff6ec7" ? "OK" : "FAIL");

// 2. auth opens with the default server prefilled (fresh visitor, no CLOUD visit)
await page.evaluate(() => {
  const auth = JSON.parse(localStorage.getItem("atori-auth") ?? "{}");
  localStorage.setItem("atori-auth", JSON.stringify({ state: { ...(auth.state ?? {}), serverUrl: "", sessionToken: "", user: null }, version: 0 }));
});
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__atori.useUi.getState().navigate("settings"));
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "SIGN IN");
  if (!btn) throw new Error("no SIGN IN button on settings");
  btn.click();
});
await new Promise((r) => setTimeout(r, 700));
const authUrl = await page.evaluate(() => document.querySelector("input[placeholder='https://your-atori-cloud.workers.dev']")?.value ?? "NO FIELD");
const submitDisabled = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((b) => ["SIGN IN", "CREATE ACCOUNT"].includes(b.textContent?.trim() ?? ""));
  return b ? b.disabled : "NO BUTTON";
});
console.log("AUTH server field:", JSON.stringify(authUrl), "submitDisabled:", submitDisabled, "|", authUrl.includes("workers.dev") && submitDisabled === false ? "OK" : "FAIL");
await page.keyboard.press("Escape");

// 3. album BACK returns to the view the album was opened from (home)
await page.evaluate(() => window.__atori.useUi.getState().navigate("home"));
await new Promise((r) => setTimeout(r, 900));
await page.evaluate(() => {
  const card = [...document.querySelectorAll("button[title*='·']")][0];
  card?.click();
});
await new Promise((r) => setTimeout(r, 1200));
const inAlbum = await page.evaluate(() => window.__atori.useUi.getState().view);
await page.evaluate(() => {
  const back = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("BACK"));
  back?.click();
});
await new Promise((r) => setTimeout(r, 900));
const afterBack = await page.evaluate(() => window.__atori.useUi.getState().view);
console.log("ALBUM BACK:", inAlbum, "->", afterBack, "|", inAlbum === "album" && afterBack === "home" ? "OK" : "FAIL");

// 4. ADD URL: typing/pasting a non-link does not auto-run
await page.keyboard.press("Escape");
await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await new Promise((r) => setTimeout(r, 900));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("ADD URL"));
  if (!btn) throw new Error("no ADD URL button");
  btn.click();
});
await new Promise((r) => setTimeout(r, 700));
const field = await page.$('input[placeholder="Paste a link, or search YouTube…"]');
if (!field) {
  console.log("ADDURL: field not found");
} else {
  await field.click();
  await field.type("Vqf'CL10;E2O", { delay: 10 });
  const value = await page.evaluate(() => document.querySelector("input[placeholder='Paste a link, or search YouTube…']")?.value ?? "");
  const phase = await page.evaluate(() => document.body.textContent.includes("That doesn't look like a link") || document.body.textContent.includes("No results"));
  console.log("ADDURL paste-typed value:", JSON.stringify(value), "autoRan:", phase, "|", value === "Vqf'CL10;E2O" && !phase ? "OK (typed text sits in field)" : "CHECK");
}
console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "none");
await browser.close();
