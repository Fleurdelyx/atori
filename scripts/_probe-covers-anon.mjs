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

await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });

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
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await page.evaluate(() => window.__atori.useUi.getState().navigate("catalogue"));
await new Promise((r) => setTimeout(r, 6000));

const covers = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll("img")];
  const blob = imgs.filter((i) => i.src.startsWith("blob:")).length;
  const empty = imgs.filter((i) => !i.src || i.src.endsWith("#") || i.src === location.href).length;
  const rows = document.querySelectorAll("div.track-row").length;
  return { total: imgs.length, blob, empty, rows };
});
await page.screenshot({ path: "qa-shots/probe-covers-anon.png" });
console.log("ANON COVERS:", JSON.stringify(covers));
console.log("STREAM REQUESTS:", coverRequests.slice(0, 6).join(" | ") || "NONE");

// ---- name save/cancel + persistence ----
await page.evaluate(() => window.__atori.useUi.getState().navigate("settings"));
await new Promise((r) => setTimeout(r, 1200));
const input = await page.$('input[placeholder="What should ATRI call you?"]');
if (!input) {
  console.log("NAME INPUT: NOT FOUND");
} else {
  await input.click({ clickCount: 3 });
  await input.type("Fleur");
  const before = await page.evaluate(() => ({
    draftShown: document.querySelector('input[placeholder="What should ATRI call you?"]').value,
    store: window.__atori.useUi.getState().displayName,
    saveDisabled: [...document.querySelectorAll("button")].find((b) => b.textContent === "SAVE")?.disabled,
  }));
  console.log("BEFORE SAVE:", JSON.stringify(before));
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent === "SAVE").click();
  });
  await new Promise((r) => setTimeout(r, 400));
  const after = await page.evaluate(() => ({
    store: window.__atori.useUi.getState().displayName,
    saved: localStorage.getItem("atori-ui")?.includes("Fleur"),
  }));
  console.log("AFTER SAVE:", JSON.stringify(after));
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2000));
  const persisted = await page.evaluate(() => ({
    store: window.__atori.useUi.getState().displayName,
    greeting: document.querySelector("h1")?.textContent?.slice(0, 40) ?? "",
    input: document.querySelector('input[placeholder="What should ATRI call you?"]')?.value ?? "",
  }));
  console.log("AFTER RELOAD:", JSON.stringify(persisted));
  // cancel path: type a new name, hit CANCEL, store must stay Fleur
  await page.evaluate(() => window.__atori.useUi.getState().navigate("settings"));
  await new Promise((r) => setTimeout(r, 1000));
  const input2 = await page.$('input[placeholder="What should ATRI call you?"]');
  await input2.click({ clickCount: 3 });
  await input2.type("Nobody");
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent === "CANCEL").click();
  });
  const cancelled = await page.evaluate(() => ({
    store: window.__atori.useUi.getState().displayName,
    input: document.querySelector('input[placeholder="What should ATRI call you?"]').value,
  }));
  console.log("AFTER CANCEL:", JSON.stringify(cancelled));
}
console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "none");
await browser.close();
