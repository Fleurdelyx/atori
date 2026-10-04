import puppeteer from "puppeteer-core";

const exe =
  process.env.QA_EDGE ??
  "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--mute-audio"],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:1430/?demo=1", { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => !!window.__atori, { timeout: 20000 });
await page.waitForFunction(async () => (await window.__atori.db.tracks.count()) > 0, { timeout: 30000 });

await page.evaluate(() => window.__atori.useUi.getState().navigate("library"));
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => window.__atori.useUi.getState().setPlaylistCreate({ seedTrackIds: [] }));
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  const inp = document.querySelector('input[placeholder="Playlist name"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inp, "QA Local");
  inp.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim() === "CREATE");
  b?.click();
});
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const tab = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith("PLAYLISTS"));
  tab?.click();
});
await new Promise((r) => setTimeout(r, 800));

const localColor = () =>
  page.evaluate(() => {
    const btn = document.querySelector("button[aria-label='Change picture for QA Local']");
    const img = btn?.querySelector("img");
    if (!img || !img.naturalWidth) return null;
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), src: img.src.slice(-14) };
  });

const setLocalPic = async (path) => {
  const inputs = await page.$$('input[type="file"][accept="image/*"]');
  await inputs[inputs.length - 1]?.uploadFile(path);
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("APPLY CROP"));
    b?.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim() === "CONFIRM");
    b?.click();
  });
  await new Promise((r) => setTimeout(r, 2200));
};

await setLocalPic("C:\\Users\\user\\Desktop\\Atori\\qa-shots\\pic-red.png");
const afterRed = await localColor();
await setLocalPic("C:\\Users\\user\\Desktop\\Atori\\qa-shots\\pic-blue.png");
const afterBlue = await localColor();

console.log(
  JSON.stringify(
    {
      afterRed,
      afterBlue,
      changed: !!afterRed && !!afterBlue && afterRed.src !== afterBlue.src && afterBlue.b > afterBlue.r,
    },
    null,
    1,
  ),
);
await browser.close();
