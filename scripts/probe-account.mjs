import puppeteer from "puppeteer-core";

const exe = process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = "https://atori-cloud.atori-server.workers.dev";

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1100, height: 860 },
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:1430/", { waitUntil: "networkidle2", timeout: 30000 });

// register a throwaway account through the real API (login if it already
// exists), then seed the persisted session before the app boots
const creds = { email: "e2e-ui@atori.test", password: "ui-pass-12345", name: "UI Probe" };
let reg = await page.evaluate(async (base, creds) => {
  const r = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  return r.json();
}, BASE, creds);
if (!reg.sessionToken) {
  reg = await page.evaluate(async (base, creds) => {
    const r = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    return r.json();
  }, BASE, creds);
}
if (!reg.sessionToken) throw new Error("register failed: " + JSON.stringify(reg));
await page.evaluate((data) => {
  localStorage.setItem("atori-auth", JSON.stringify({ state: data, version: 0 }));
}, { serverUrl: BASE, sessionToken: reg.sessionToken, user: reg.user });
await page.reload({ waitUntil: "networkidle2" });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });

await page.evaluate(() => window.__atori.useUi.getState().navigate("settings"));
await new Promise((r) => setTimeout(r, 4600)); // let the boot set-piece finish

// open the account panel
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("ACCOUNT SETTINGS"));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 600));
const info = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll("div.clip-notch")].filter((d) => /MINUTES 分/.test(d.textContent ?? ""));
  const panel = [...document.querySelectorAll("span")].find((x) => (x.textContent ?? "").includes("ACCOUNT SETTINGS"));
  const email = [...document.querySelectorAll("span")].find((x) => (x.textContent ?? "").trim() === "CHANGE EMAIL メールアドレス変更");
  const pw = [...document.querySelectorAll("span")].find((x) => (x.textContent ?? "").trim() === "CHANGE PASSWORD パスワード変更");
  const scroller = document.querySelector(".no-scrollbar");
  return {
    signedInAs: panel ? "yes" : "no",
    statTiles: tiles.length,
    statText: tiles[0]?.parentElement?.textContent?.slice(0, 120) ?? null,
    emailForm: !!email,
    passwordForm: !!pw,
    passwordFields: document.querySelectorAll("input[type='password']").length,
    scrollerHidesScrollbar: scroller ? getComputedStyle(scroller).scrollbarWidth === "none" : false,
  };
});
await page.screenshot({ path: "qa-shots/probe-account.png" });
const panelState = await page.evaluate(() => {
  const overlay = [...document.querySelectorAll("div.fixed.inset-0.z-\\[70\\]")];
  const header = [...document.querySelectorAll("span")].find((x) => (x.textContent ?? "").includes("ACCOUNT SETTINGS"));
  return {
    overlays: overlay.length,
    overlayVisible: overlay.map((o) => getComputedStyle(o).opacity),
    headerStillThere: !!header,
  };
});
console.log(JSON.stringify({ ...info, panelState }));
await browser.close();
