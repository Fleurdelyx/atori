import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const BASE = process.env.PROBE_URL ?? "http://127.0.0.1:1431/";
const OUT = "qa-shots/mobile";
mkdirSync(OUT, { recursive: true });

const VP = process.env.PROBE_VP === "small"
  ? { width: 360, height: 780 }
  : { width: 390, height: 844 };

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
await page.setViewport({ ...VP, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// scroll the Director container (main scroll area) step by step, shooting each
const scrollShots = async (prefix, max = 3) => {
  for (let i = 0; i < max; i++) {
    const more = await page.evaluate(() => {
      const el = [...document.querySelectorAll("main .overflow-y-auto, main > div")].find((n) => n.scrollHeight > n.clientHeight + 40);
      if (!el) return false;
      el.scrollTop += el.clientHeight * 0.85;
      return el.scrollTop > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 40;
    });
    await sleep(400);
    await shot(`${prefix}-${i + 1}`);
    if (!more) break;
  }
};

// buttons anywhere except the navs (tabs, chips, overlays, actions)
const clickButton = async (label) => {
  await page.waitForFunction(
    (l) => [...document.querySelectorAll("button")].some((b) => !b.closest("nav") && (b.textContent ?? "").trim().includes(l)),
    { timeout: 30000 },
    label,
  );
  await page.evaluate((l) => {
    [...document.querySelectorAll("button")].find((b) => !b.closest("nav") && (b.textContent ?? "").trim().includes(l)).click();
  }, label);
};
// bottom mobile nav via aria-label
const clickNav = async (label) => {
  await page.waitForSelector(`nav button[aria-label="${label}"]`, { timeout: 30000 });
  await page.evaluate((l) => document.querySelector(`nav button[aria-label="${l}"]`).click(), label);
};

await page.goto(BASE + "?demo", { waitUntil: "networkidle2", timeout: 45000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
// skip the first-run chooser: remembered-server anonymous visitor (catalogue visible)
await page.evaluate(() => {
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
await sleep(3500); // boot animation + demo import

// wait for the demo library to land in Dexie
await page.waitForFunction(() => window.__atori && window.__atori.db, { timeout: 30000 });
await sleep(2500);

// 1. HOME
await page.evaluate(() => window.__atori.useUi.getState().navigate("home"));
await sleep(1200);
await shot("01-home");
await scrollShots("01b-home");

// search dropdown open state
await page.evaluate(() => {
  const input = document.querySelector('input[placeholder="SEARCH ・ 検索…"]');
  if (input) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "a");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }
});
await sleep(700);
await shot("02-home-search");
await page.evaluate(() => document.activeElement?.blur());

// 2. LIBRARY / tracks
await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await sleep(1500);
await shot("03-library-tracks");
await scrollShots("03b-library-tracks");

// playlists tab (local)
await clickButton("PLAYLISTS");
await sleep(900);
await shot("04-library-playlists-local");

// playlists tab cloud scope
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("main button")].filter((b) => (b.textContent ?? "").includes("CLOUD"));
  btns[btns.length - 1].click();
});
await sleep(900);
await shot("05-library-playlists-cloud");

// albums tab
await clickButton("ALBUMS");
await sleep(900);
await shot("06-library-albums");

// artists tab + select one
await clickButton("ARTISTS");
await sleep(900);
await shot("07-library-artists");

// 3. ALBUM screen: click the first album card (grid or rail row)
await page.evaluate(() => {
  window.__atori.useUi.getState().navigate("library");
});
await clickButton("ALBUMS");
await sleep(600);
const openedAlbum = await page.evaluate(() => {
  const card = document.querySelector("button[title*='·']");
  if (!card) return false;
  card.click();
  return true;
});
await sleep(1500);
await shot("08-album");
if (openedAlbum) {
  await page.evaluate(() => window.__atori.useUi.getState().navigateBack());
  await sleep(600);
}

// 4. CLOUD
await clickNav("CLOUD");
await sleep(2000);
await shot("09-cloud");

// 5. CATALOGUE
await clickNav("CATALOGUE");
await sleep(4000);
await shot("10-catalogue");

// 6. SETTINGS (tall page, several shots)
await clickNav("SETTINGS");
await sleep(1500);
await shot("11-settings-top");
await scrollShots("11b-settings");

// 7. NOW PLAYING: play a track from the demo library
await page.evaluate(async () => {
  const { db } = window.__atori;
  const tracks = await db.tracks.limit(6).toArray();
  if (tracks.length) {
    window.__atori.engine.playQueue(tracks, 0);
    window.__atori.useUi.getState().setNowPlayingOpen(true);
  }
});
await sleep(2500);
await shot("12-np-default");

// flat mode
await clickButton("FLAT");
await sleep(1200);
await shot("13-np-flat");
await clickButton("FLAT");

// queue panel over NP
await page.evaluate(() => window.__atori.useUi.getState().setQueueOpen(true));
await sleep(1200);
await shot("14-queue-panel");
// flip to the other queue style (default is phonograph: the toggle reads PANEL)
const flip = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => !x.closest("nav") && ["PHONOGRAPH", "PANEL"].some((l) => (x.textContent ?? "").trim().includes(l)));
  if (!b) return null;
  const was = (b.textContent ?? "").trim();
  b.click();
  return was.includes("PANEL") ? "phonograph" : "panel";
});
await sleep(1200);
await shot(flip === "phonograph" ? "15-queue-phonograph" : "15-queue-panel");
await page.evaluate(() => window.__atori.useUi.getState().setQueueOpen(false));
await sleep(800);

// close NP to the mini bar, screenshot the shell with mini player + mobile nav
await clickButton("MINIMIZE");
await sleep(1000);
await shot("16-shell-minibar");

// floating bubble state
await page.evaluate(() => window.__atori.useUi.getState().setMiniBubble(true));
await sleep(900);
await shot("17-minibubble");
await page.evaluate(() => window.__atori.useUi.getState().setMiniBubble(false));

// 8. context menu over a track row (mobile long-press equivalent)
await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await sleep(1200);
await page.evaluate(() => {
  const row = document.querySelector(".track-row");
  if (row) {
    const r = row.getBoundingClientRect();
    row.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 60, clientY: r.top + 20 }),
    );
  }
});
await sleep(900);
await shot("18-context-menu");
await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
await sleep(500);

// 9. playlist create dialog
await page.evaluate(() => window.__atori.useUi.getState().setPlaylistCreate({}));
await sleep(900);
await shot("19-playlist-create");
await page.evaluate(() => window.__atori.useUi.getState().setPlaylistCreate(null));
await sleep(400);

// 10. theme studio overlay
await page.evaluate(() => window.__atori.useUi.getState().setThemeStudioOpen(true));
await sleep(1200);
await shot("20-theme-studio");
await page.evaluate(() => window.__atori.useUi.getState().setThemeStudioOpen(false));

// 11. auth overlay (signed-out visitor tapping SIGN IN in settings)
await clickNav("SETTINGS");
await sleep(800);
const hasSignIn = await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "SIGN IN"));
if (hasSignIn) {
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "SIGN IN").click();
  });
  await sleep(1200);
  await shot("21-auth");
}

// layout overflow audit: elements wider than the viewport / horizontal scroll
const audit = await page.evaluate(() => {
  const docW = document.documentElement.clientWidth;
  const bad = [];
  const walk = (el, depth) => {
    if (depth > 24 || bad.length > 40) return;
    for (const n of el.children) {
      const r = n.getBoundingClientRect();
      if (r.width > 0 && (r.right > docW + 1 || r.left < -1) && !n.closest(".no-scrollbar")) {
        const cls = (n.className && String(n.className).slice(0, 60)) || n.tagName;
        bad.push(`${n.tagName}.${cls} L${Math.round(r.left)} R${Math.round(r.right)}`);
      }
      walk(n, depth + 1);
    }
  };
  walk(document.body, 0);
  return { docW, scrollW: document.documentElement.scrollWidth, bad };
});
console.log("OVERFLOW AUDIT:", JSON.stringify(audit, null, 1));
console.log("PAGE ERRORS:", errors.length ? errors.join(" | ") : "none");
await browser.close();
