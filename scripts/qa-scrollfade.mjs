/**
 * ScrollFade QA: the screen scrollbars (Home / Library / Settings) hide the
 * native bar, show the overlay thumb while scrolling, and fade out after
 * ~1.1s of inactivity.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-scrollfade.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: await mkdtemp(join(tmpdir(), "atori-sbfade-")),
  args: ["--no-first-run", "--mute-audio"],
  defaultViewport: { width: 1400, height: 880 },
});
const page = await browser.newPage();
const problems = [];
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${String(e).slice(0, 240)}`);
    console.log(`FAIL ${name}: ${String(e).slice(0, 240)}`);
  }
};

await page.goto(`${process.env.QA_BASE ?? "http://127.0.0.1:1431"}/?demo`, { waitUntil: "domcontentloaded" });
await sleep(8500);

await step("home-container", async () => {
  const st = await page.evaluate(() => {
    const box = document.querySelector("main .scroll-fade");
    if (!box) return { ok: false, why: "no .scroll-fade in main" };
    const strip = box.querySelector(":scope > .fade-sb-strip");
    if (!strip) return { ok: false, why: "no .fade-sb-strip" };
    return {
      ok: true,
      nativeHidden: getComputedStyle(box).scrollbarWidth === "none",
      fits: strip.hasAttribute("data-fits"),
      idleActive: strip.hasAttribute("data-active"),
    };
  });
  if (!st.ok) throw new Error(st.why);
  if (!st.nativeHidden) throw new Error("native scrollbar not hidden");
  if (st.idleActive) throw new Error("thumb visible while idle");
  console.log(`     (home content ${st.fits ? "fits: no bar needed" : "overflows"})`);
});

await step("home-show-on-scroll", async () => {
  await page.evaluate(() => {
    const box = document.querySelector("main .scroll-fade");
    // demo content may fit the viewport: force real overflow
    box.style.height = "320px";
  });
  await sleep(300);
  const fits = await page.evaluate(() =>
    document.querySelector("main .scroll-fade > .fade-sb-strip").hasAttribute("data-fits"),
  );
  if (fits) throw new Error("container still marked data-fits after shrink");
  await page.evaluate(() => {
    const box = document.querySelector("main .scroll-fade");
    box.scrollTop = 500;
  });
  await sleep(300);
  const st = await page.evaluate(() => {
    const strip = document.querySelector("main .scroll-fade > .fade-sb-strip");
    const thumb = strip?.firstElementChild;
    return {
      active: strip?.hasAttribute("data-active") ?? false,
      opacity: thumb ? getComputedStyle(thumb).opacity : null,
    };
  });
  if (!st.active) throw new Error("data-active not set on scroll");
  if (st.opacity !== "1") throw new Error(`thumb opacity ${st.opacity} while scrolling`);
  await page.screenshot({ path: "qa-shots/scrollfade-active.png" });
});

await step("home-fade-out-when-idle", async () => {
  await sleep(3000); // 1.8s idle + 0.55s fade + margin
  const st = await page.evaluate(() => {
    const strip = document.querySelector("main .scroll-fade > .fade-sb-strip");
    const thumb = strip?.firstElementChild;
    return {
      active: strip?.hasAttribute("data-active") ?? false,
      opacity: thumb ? getComputedStyle(thumb).opacity : null,
    };
  });
  if (st.active) throw new Error("data-active still set after idle");
  if (st.opacity !== "0") throw new Error(`thumb opacity ${st.opacity} after fade`);
  await page.screenshot({ path: "qa-shots/scrollfade-idle.png" });
});

await step("home-hover-reveals", async () => {
  await page.evaluate(() => {
    const box = document.querySelector("main .scroll-fade");
    const r = box.getBoundingClientRect();
    box.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: r.right - 4, clientY: r.top + 200 }),
    );
  });
  await sleep(250);
  const st = await page.evaluate(() => {
    const strip = document.querySelector("main .scroll-fade > .fade-sb-strip");
    return { hover: strip?.hasAttribute("data-hover") ?? false, active: strip?.hasAttribute("data-active") ?? false };
  });
  if (!st.hover || !st.active) throw new Error(`hover reveal failed: ${JSON.stringify(st)}`);
});

await step("library-tracks-list", async () => {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button, a")].find((x) => /^LIBRARY/i.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(1200);
  const st = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll("main .scroll-fade")];
    return { count: boxes.length, anyStrip: boxes.every((b) => b.querySelector(":scope > .fade-sb-strip")) };
  });
  if (st.count < 1 || !st.anyStrip) throw new Error(`library fade containers: ${JSON.stringify(st)}`);
  await page.evaluate(() => {
    const box = document.querySelector("main .scroll-fade");
    if (!box) throw new Error("no .scroll-fade in library");
    box.style.maxHeight = "300px"; // force overflow (height is flex-controlled)
  });
  await sleep(300);
  await page.evaluate(() => {
    const box = [...document.querySelectorAll("main .scroll-fade")].find(
      (b) => !b.querySelector(":scope > .fade-sb-strip").hasAttribute("data-fits"),
    );
    if (!box) throw new Error("no scrollable library container after shrink");
    box.scrollTop = 400;
  });
  await sleep(250);
  const active = await page.evaluate(
    () => [...document.querySelectorAll("main .scroll-fade > .fade-sb-strip")].some((s) => s.hasAttribute("data-active")),
  );
  if (!active) throw new Error("no library container showed its thumb on scroll");
});

await step("settings-container", async () => {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button, a")].find((x) => /^SETTINGS/i.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(1000);
  const st = await page.evaluate(() => {
    const box = document.querySelector("main .scroll-fade");
    return { has: !!box, strip: !!box?.querySelector(":scope > .fade-sb-strip") };
  });
  if (!st.has || !st.strip) throw new Error("settings scroll container missing");
});

console.log(problems.length === 0 ? "\nSCROLLFADE PASS" : `\n${problems.length} PROBLEM(S):`);
for (const p of problems) console.log("  ", p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
