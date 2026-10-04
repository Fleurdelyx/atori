import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = process.env.PROBE_URL ?? "http://127.0.0.1:1430/";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
const errors = [];
const coverRequests = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
page.on("response", (r) => {
  if (r.url().includes("/api/stream/")) coverRequests.push(`${r.status()} ${r.url().slice(0, 110)}`);
});

const clickNav = async (label) => {
  await page.waitForFunction(
    (l) => [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").includes(l)),
    { timeout: 30000 },
    label,
  );
  await page.evaluate((l) => {
    [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(l)).click();
  }, label);
};

await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("button", { timeout: 30000 });

// seed the remembered-server anonymous state (no session), skip the first-run chooser
await page.evaluate(() => {
  localStorage.setItem(
    "atori-ui",
    JSON.stringify({
      state: { cloudSetupDone: true, offlineMode: false, catalogueEnabled: true },
      version: 0,
    }),
  );
  localStorage.setItem(
    "atori-auth",
    JSON.stringify({
      state: { serverUrl: "https://atori-cloud.atori-server.workers.dev", sessionToken: "", user: null },
      version: 0,
    }),
  );
});
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("button", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2000));

await clickNav("CATALOGUE");
await new Promise((r) => setTimeout(r, 7000));

const covers = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll("img")];
  return {
    total: imgs.length,
    blob: imgs.filter((i) => i.src.startsWith("blob:")).length,
    rows: document.body.textContent.includes("TRACKS"),
  };
});
await page.screenshot({ path: "qa-shots/probe-covers-anon-live.png" });
console.log("ANON COVERS:", JSON.stringify(covers));
console.log("STREAM REQUESTS:", coverRequests.slice(0, 4).join(" | ") || "NONE");

// ---- name save/cancel + persistence (no dev hook on prod: read the UI) ----
await clickNav("SETTINGS");
await new Promise((r) => setTimeout(r, 1500));
const input = await page.$('input[placeholder="What should ATRI call you?"]');
if (!input) {
  console.log("NAME INPUT: NOT FOUND");
} else {
  await input.click({ clickCount: 3 });
  await input.type("Fleur");
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent === "SAVE").click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const saved = await page.evaluate(() => localStorage.getItem("atori-ui")?.includes('"displayName":"Fleur"'));
  console.log("AFTER SAVE: localStorage has name =", saved);
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector("h1", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  const greeting = await page.evaluate(() => document.querySelector("h1")?.textContent?.slice(0, 40) ?? "");
  console.log("AFTER RELOAD greeting:", JSON.stringify(greeting));
  await clickNav("SETTINGS");
  await new Promise((r) => setTimeout(r, 1200));
  const input2 = await page.$('input[placeholder="What should ATRI call you?"]');
  await input2.click({ clickCount: 3 });
  await input2.type("Nobody");
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent === "CANCEL").click();
  });
  await new Promise((r) => setTimeout(r, 300));
  const after = await page.evaluate(() => ({
    input: document.querySelector('input[placeholder="What should ATRI call you?"]').value,
    store: JSON.parse(localStorage.getItem("atori-ui")).state.displayName,
  }));
  console.log("AFTER CANCEL:", JSON.stringify(after));
}
console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "none");
await browser.close();
