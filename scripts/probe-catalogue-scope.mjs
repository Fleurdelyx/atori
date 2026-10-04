import puppeteer from "puppeteer-core";

const exe = process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = "https://atori-cloud.atori-server.workers.dev";
const EMAIL = "e2e-scope@atori.test";

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1200, height: 860 },
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:1430/", { waitUntil: "networkidle2", timeout: 30000 });

// sign in via the real API (the account is admin in D1), seed persisted session
const reg = await page.evaluate(async (base, email) => {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "scope-pass-1" }),
  });
  return r.json();
}, BASE, EMAIL);
if (!reg.sessionToken) throw new Error("login failed: " + JSON.stringify(reg));
console.log("isAdmin:", reg.user.isAdmin);
await page.evaluate((data) => {
  localStorage.setItem("atori-auth", JSON.stringify({ state: data, version: 0 }));
}, { serverUrl: BASE, sessionToken: reg.sessionToken, user: reg.user });
await page.reload({ waitUntil: "networkidle2" });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 4600)); // boot set-piece + catalogue fetch

await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await new Promise((r) => setTimeout(r, 900));

const clickScope = (label) =>
  page.evaluate((label) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim() === label);
    if (!b) throw new Error("scope chip missing: " + label);
    b.click();
  }, label);

const countRows = () =>
  page.evaluate(() => ({
    rows: document.querySelectorAll("div.track-row").length,
    catBadges: [...document.querySelectorAll("span")].filter((s) => (s.textContent ?? "").trim() === "CTL" && s.title).length,
  }));

await clickScope("CATALOGUE");
await new Promise((r) => setTimeout(r, 700));
const catalogue = await countRows();
await clickScope("CLOUD");
await new Promise((r) => setTimeout(r, 700));
const personal = await countRows();
await clickScope("ALL");
await new Promise((r) => setTimeout(r, 700));
const all = await countRows();
await clickScope("CATALOGUE");
await new Promise((r) => setTimeout(r, 500));

const chips = await page.evaluate(() =>
  [...document.querySelectorAll("button")].filter((b) => ["ALL", "LOCAL", "CLOUD", "CATALOGUE", "OFFLINE"].includes((b.textContent ?? "").trim())).map((b) => (b.textContent ?? "").trim()),
);
console.log(JSON.stringify({ isAdmin: reg.user.isAdmin, chips, catalogue, personal, all }));
await page.screenshot({ path: "qa-shots/probe-scope.png", clip: { x: 0, y: 0, width: 1200, height: 420 } });
await browser.close();
