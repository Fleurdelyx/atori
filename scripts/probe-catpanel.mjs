import puppeteer from "puppeteer-core";

const exe = process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = "https://atori-cloud.atori-server.workers.dev";
const EMAIL = "e2e-cat@atori.test";

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1100, height: 860 },
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:1430/?demo=1", { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await page.waitForFunction(async () => (await window.__atori.db.tracks.count()) > 0, { timeout: 30000 });

// throwaway admin account (register or reuse), seeded as a persisted session
const reg = await page.evaluate(async (base, email) => {
  const r = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "cat-pass-12345", name: "Cat Admin" }),
  });
  if (r.ok) return r.json();
  return (
    await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "cat-pass-12345" }),
    })
  ).json();
}, BASE, EMAIL);
if (!reg.sessionToken) throw new Error("auth failed: " + JSON.stringify(reg));
await page.evaluate((data) => {
  localStorage.setItem("atori-auth", JSON.stringify({ state: data, version: 0 }));
}, { serverUrl: BASE, sessionToken: reg.sessionToken, user: reg.user });
await page.reload({ waitUntil: "networkidle2" });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 4600)); // boot set-piece

await page.evaluate(() => {
  window.__atori.useUi.getState().navigate("cloud");
});
await new Promise((r) => setTimeout(r, 900));

await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("UPLOAD TO CATALOGUE"));
  if (b) b.click();
  else throw new Error("UPLOAD TO CATALOGUE button missing (isAdmin not picked up?)");
});
await new Promise((r) => setTimeout(r, 800));

const before = await page.evaluate(() => {
  const panel = [...document.querySelectorAll("span")].find((x) => (x.textContent ?? "").includes("UPLOAD TO CATALOGUE"));
  const rows = [...document.querySelectorAll("button")].filter((b) => b.querySelector("span.h-4.w-4"));
  const selAll = [...document.querySelectorAll("button")].find((x) => /SELECT ALL|CLEAR ALL/.test(x.textContent ?? ""));
  return {
    panelOpen: !!panel,
    trackRows: rows.length,
    selectAllLabel: selAll?.textContent?.trim() ?? null,
    footer: [...document.querySelectorAll("span")].map((s) => s.textContent).find((t) => /^\d+ SELECTED$/.test(t ?? "")) ?? null,
  };
});
// search narrows the list
await page.type("input[placeholder='SEARCH ・ 検索…']", "a");
await new Promise((r) => setTimeout(r, 400));
const searched = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("button")].filter((b) => b.querySelector("span.h-4.w-4"));
  return { rowsAfterSearch: rows.length };
});
await page.evaluate(() => {
  const i = document.querySelector("input[placeholder='SEARCH ・ 検索…']");
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(i, "");
  i.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: "qa-shots/probe-catpanel.png" });
console.log(JSON.stringify({ ...before, ...searched }));
await browser.close();
