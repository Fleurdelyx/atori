import puppeteer from "puppeteer-core";

const exe = process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio", "--window-size=500,700"],
  defaultViewport: { width: 500, height: 700 },
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:1430/?demo=1", { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => {
  const ui = window.__atori?.useUi;
  return ui && ui.getState().view === "home";
}, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__atori.useUi.getState().navigate("home"));
await new Promise((r) => setTimeout(r, 600));

const sectionSel = () => {
  const s = [...document.querySelectorAll("section")].find((x) => x.querySelector("h2")?.textContent === "RECENTLY ADDED");
  const btns = [...s.querySelectorAll("button[aria-label^='Scroll']")];
  const sc = s.querySelector("div.flex.overflow-x-auto");
  return { arrows: btns.length, sc, btns };
};

// hover the row so the Steam-style chevrons reveal, then capture
const sec = await page.evaluateHandle(() =>
  [...document.querySelectorAll("section")].find((x) => x.querySelector("h2")?.textContent === "RECENTLY ADDED"),
);
const box = await sec.asElement().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 400));

const before = await page.evaluate(() => {
  const s = [...document.querySelectorAll("section")].find((x) => x.querySelector("h2")?.textContent === "RECENTLY ADDED");
  const btnBack = s.querySelector("button[aria-label='Scroll RECENTLY ADDED back']");
  const btnFwd = s.querySelector("button[aria-label='Scroll RECENTLY ADDED forward']");
  const sc = s.querySelector("div.flex.overflow-x-auto");
  const art = sc.querySelector("img, span");
  const artBox = art.getBoundingClientRect();
  const backBox = btnBack.getBoundingClientRect();
  // the Director view wrapper is the horizontal-overflow suspect
  const director = s.closest("div[style], div")?.parentElement;
  const overflowers = [];
  let node = s.parentElement;
  while (node && node !== document.body) {
    if (node.scrollWidth > node.clientWidth + 1) overflowers.push({ cls: node.className.slice(0, 60), extra: node.scrollWidth - node.clientWidth });
    node = node.parentElement;
  }
  return {
    arrows: 2,
    overflow: sc.scrollWidth > sc.clientWidth,
    scrollLeft0: sc.scrollLeft,
    scrollbarHidden: getComputedStyle(sc).scrollbarWidth === "none",
    artCenterY: Math.round(artBox.top + artBox.height / 2),
    arrowCenterY: Math.round(backBox.top + backBox.height / 2),
    arrowInsideViewport: backBox.left >= 0,
    horizontalOverflowers: overflowers,
  };
});
await page.screenshot({ path: "qa-shots/probe-carousel.png", clip: { x: 0, y: Math.max(0, box.y - 8), width: 500, height: 380 } });

// the right chevron overlays the last visible card; click it via the mouse
const right = await sec.asElement().$('button[aria-label="Scroll RECENTLY ADDED forward"]');
const rbox = await right.boundingBox();
await page.mouse.click(rbox.x + rbox.width / 2, rbox.y + rbox.height / 2);
await new Promise((r) => setTimeout(r, 800));
const scrollLeftAfter = await page.evaluate(() => {
  const s = [...document.querySelectorAll("section")].find((x) => x.querySelector("h2")?.textContent === "RECENTLY ADDED");
  return s.querySelector("div.flex.overflow-x-auto").scrollLeft;
});
console.log(JSON.stringify({ ...before, scrollLeftAfter, moved: scrollLeftAfter > before.scrollLeft0 }));
await browser.close();
