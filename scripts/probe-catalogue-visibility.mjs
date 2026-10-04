import puppeteer from "puppeteer-core";

const exe = process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = "https://atori-cloud.atori-server.workers.dev";
const EMAIL = "e2e-see@atori.test";

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1200, height: 860 },
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:1430/?demo=1", { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await page.waitForFunction(async () => (await window.__atori.db.tracks.count()) > 0, { timeout: 30000 });

const reg = await page.evaluate(async (base, email) => {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "see-pass-1" }),
  });
  return r.json();
}, BASE, EMAIL);
if (!reg.sessionToken) throw new Error("login failed: " + JSON.stringify(reg));
await page.evaluate((data) => {
  localStorage.setItem("atori-auth", JSON.stringify({ state: data, version: 0 }));
}, { serverUrl: BASE, sessionToken: reg.sessionToken, user: reg.user });
await page.reload({ waitUntil: "networkidle2" });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 4600));
await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await new Promise((r) => setTimeout(r, 900));

const clickScope = (label) =>
  page.evaluate((label) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim() === label);
    if (!b) throw new Error("scope chip missing: " + label);
    b.click();
  }, label);

const measure = () =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll("div.track-row")];
    const titles = rows.map((r) => r.querySelector("span.truncate")?.textContent ?? "");
    const badged = rows.filter((r) => [...r.querySelectorAll("span")].some((s) => (s.textContent ?? "").trim() === "CTL" && s.title)).length;
    return { rows: rows.length, badged, titles: titles.slice(0, 12) };
  });

await clickScope("CATALOGUE");
await new Promise((r) => setTimeout(r, 800));
const catalogue = await measure();
await clickScope("ALL");
await new Promise((r) => setTimeout(r, 800));
const all = await measure();
await clickScope("CLOUD");
await new Promise((r) => setTimeout(r, 800));
const personal = await measure();
await page.evaluate(() => window.__atori.useUi.getState().navigate("home"));
console.log(JSON.stringify({ catalogue, all, personal }, null, 1));
await browser.close();
