/** One-off: volume in NP modes, seek/volume diamond autofade, sleep menu scrollbar. */
import puppeteer from "puppeteer-core";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
let page = (await browser.pages())[0];
for (const t of await browser.pages()) {
  const u = await t.url();
  if (u.includes("tauri") || u.includes("localhost")) page = t;
}
const results = {};

// --- 1. NowPlaying (regular mode) volume present ---------------------------
await page.evaluate(() => {
  window.__atori.useUi.getState().setNowPlayingOpen(true);
});
await sleep(1200);
results.npVolume = await page.evaluate(() => {
  const slider = document.querySelector('input.ato-slider.fade-thumb');
  return !!slider && slider.getBoundingClientRect().height > 0;
});

// --- 2. seek diamond autofade ----------------------------------------------
await page.evaluate(() => {
  const bar = document.querySelector('div.group.h-6');
  const r = bar.getBoundingClientRect();
  return r;
});
// hover the bar
{
  const r = await page.evaluate(() => {
    const bar = document.querySelector('div.group.h-6');
    const b = bar.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  const client = await page.createCDPSession();
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
  await sleep(250);
  const during = await page.evaluate(() => {
    const h = document.querySelector('div.group.h-6 > div:nth-child(3)');
    return getComputedStyle(h).opacity;
  });
  await sleep(3000); // 1.6s idle + 0.7s fade + margin
  const after = await page.evaluate(() => {
    const h = document.querySelector('div.group.h-6 > div:nth-child(3)');
    return getComputedStyle(h).opacity;
  });
  results.seekFade = { during, after };
}

// --- 3. volume diamond autofade --------------------------------------------
{
  const r = await page.evaluate(() => {
    const v = document.querySelector('input.ato-slider.fade-thumb');
    const b = v.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  const client = await page.createCDPSession();
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
  await sleep(250);
  const during = await page.evaluate(() => {
    const v = document.querySelector('input.ato-slider.fade-thumb');
    return getComputedStyle(v, "::-webkit-slider-thumb").opacity;
  });
  await sleep(3000);
  const after = await page.evaluate(() => {
    const v = document.querySelector('input.ato-slider.fade-thumb');
    return { opacity: getComputedStyle(v, "::-webkit-slider-thumb").opacity, live: v.hasAttribute("data-live") };
  });
  results.volFade = { during, after };
}

// --- 4. sleep menu scrollbar via ScrollFade ---------------------------------
await page.evaluate(() => window.__atori.useUi.getState().navigate("settings"));
await sleep(1000);
{
  const r = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Sleep timer hours"]');
    const rect = b.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  const client = await page.createCDPSession();
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
  await sleep(900); // let the stagger settle
}
results.sleepMenu = await page.evaluate(() => {
  const menu = document.querySelector("[data-atori-ctxmenu]");
  const scroller = menu?.querySelector(".scroll-fade");
  const strip = scroller?.querySelector(":scope > .fade-sb-strip");
  return {
    scrollFade: !!scroller,
    strip: !!strip,
    nativeHidden: scroller ? getComputedStyle(scroller).scrollbarWidth === "none" : null,
    items: menu ? menu.querySelectorAll("button").length : 0,
  };
});
// scroll inside the menu → strip activates
await page.evaluate(() => {
  const sc = document.querySelector("[data-atori-ctxmenu] .scroll-fade");
  sc.scrollTop = 300;
});
await sleep(300);
results.sleepMenuScroll = await page.evaluate(() => {
  const strip = document.querySelector("[data-atori-ctxmenu] .fade-sb-strip");
  return { active: strip?.hasAttribute("data-active") ?? false };
});
await page.screenshot({ path: "qa-shots/sleep-menu-fadebar.png", clip: { x: 660, y: 100, width: 400, height: 700 } });
await page.keyboard.press("Escape");

// close Now Playing
await page.evaluate(() => window.__atori.useUi.getState().setNowPlayingOpen(false));
console.log(JSON.stringify(results, null, 1));
await browser.disconnect();
console.log("done");
