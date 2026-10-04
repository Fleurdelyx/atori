/**
 * Video / GIF visual QA: synthesizes a real video clip (canvas →
 * MediaRecorder → webm) inside the page, imports it as a track and as an
 * attached clip/gif visual via the dev Dexie hook, then walks the Now Playing
 * visual panel ("Spotify canvas" sidebar), THEATRE mode, and the flat layout.
 *
 *   QA_BASE=http://127.0.0.1:1431 node scripts/qa-video.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:1431";
const OUT = "qa-shots";
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: await mkdtemp(join(tmpdir(), "atori-vid-")),
  args: ["--no-first-run", "--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1400, height: 880 },
});
const page = await browser.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on("framenavigated", (f) => f === page.mainFrame() && console.log(`     [nav] → ${f.url().slice(0, 80)}`));
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${String(e).slice(0, 240)}`);
    console.log(`FAIL ${name}: ${String(e).slice(0, 240)}`);
  }
};
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });
const openNowPlaying = async () => {
  // drive the store directly: synthetic footer clicks race with re-renders
  await page.evaluate(() => window.__atori.useUi.getState().setNowPlayingOpen(true));
  await sleep(1600);
  const st = await page.evaluate(() => ({
    open: window.__atori.useUi.getState().nowPlayingOpen,
    booted: window.__atori.useUi.getState().booted,
    title: window.__atori.engine.current?.title ?? null,
    overlayText: [...document.querySelectorAll("div")].some((d) => /NOW PLAYING/.test(d.textContent ?? "")),
  }));
  console.log(`     [np] open=${st.open} booted=${st.booted} track=${JSON.stringify(st.title)} overlay=${st.overlayText}`);
};
const closeNowPlaying = async () => {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /CLOSE/i.test(x.textContent ?? ""));
    if (b) b.click();
  });
  await sleep(800);
};
const playByTitle = (titleVar) =>
  page.evaluate((tv) => {
    const { engine, db } = window.__atori;
    return db.tracks.where("title").equals(window[tv]).first().then((t) => {
      if (t) void engine.playQueue([t], 0);
      return t?.title ?? null;
    });
  }, titleVar);
// the synthesized clips are ~3s: pause before they end, or the app's
// autoplay-extension (correctly) moves on to similar demo tracks
const pauseEngine = () => page.evaluate(() => window.__atori.engine.el.pause());

await step("boot", async () => {
  await page.goto(`${BASE}/?demo`, { waitUntil: "domcontentloaded" });
  await sleep(8500);
  const has = await page.evaluate(() => !!window.__atori?.db);
  if (!has) throw new Error("dev db hook missing");
});

await step("make-test-media", async () => {
  const ok = await page.evaluate(async () => {
    // --- a 3s animated webm: pulsing color bars on canvas
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((res) => (rec.onstop = res));
    rec.start();
    const t0 = performance.now();
    await new Promise((resolve) => {
      const draw = () => {
        const t = (performance.now() - t0) / 1000;
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = `hsl(${(i * 45 + t * 120) % 360} 90% ${45 + 25 * Math.sin(t * 4 + i)}%)`;
          ctx.fillRect(i * 80, 0, 80, 360);
        }
        ctx.fillStyle = "#fff";
        ctx.font = "bold 44px monospace";
        ctx.fillText("ATORI " + t.toFixed(1), 110, 190);
        if (t < 3) requestAnimationFrame(draw);
        else resolve();
      };
      draw();
    });
    rec.stop();
    await done;
    const vidBlob = new Blob(chunks, { type: "video/webm" });
    if (vidBlob.size < 5000) return `webm too small: ${vidBlob.size}`;

    // --- a minimal valid GIF (1x1, decodable)
    const b64 = "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
    const bin = atob(b64);
    const gifBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) gifBytes[i] = bin.charCodeAt(i);
    const gifBlob = new Blob([gifBytes], { type: "image/gif" });

    // --- import the video as a track (same shape importEntries writes)
    const { db } = window.__atori;
    const djb2 = (s) => {
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return h >>> 0;
    };
    const vPath = "tests/neon-bars.webm";
    const vFile = new File([vidBlob], "neon-bars.webm", { type: "video/webm" });
    await db.transaction("rw", db.tracks, db.sources, async () => {
      await db.tracks.put({
        id: djb2(vPath),
        path: vPath,
        fileName: "neon-bars.webm",
        title: "Neon Bars (video test)",
        artist: "QA Suite",
        artists: ["QA Suite"],
        album: "QA Reels",
        albumArtist: "QA Suite",
        trackNo: 1,
        discNo: null,
        year: 2026,
        genre: ["SYNTHWAVE"],
        duration: 3,
        format: "webm",
        bitrate: null,
        sampleRate: 48000,
        bitDepth: null,
        lossless: false,
        grade: "N",
        coverKey: null,
        hasVideo: true,
        source: "local",
        playable: true,
        addedAt: Date.now(),
        playCount: 0,
        lastPlayedAt: null,
      });
      await db.sources.put({ path: vPath, file: vFile });
    });

    // --- attach the clip as a visual on a demo audio track, gif on another
    const all = await db.tracks.filter((t) => t.source !== "cloud").toArray();
    const target = all[0];
    if (!target) return "no demo track to attach to";
    await db.visuals.put({ trackId: target.id, blob: vidBlob, mime: "video/webm", kind: "clip", createdAt: Date.now() });
    if (all[1]) {
      await db.visuals.put({ trackId: all[1].id, blob: gifBlob, mime: "image/gif", kind: "gif", createdAt: Date.now() });
    }
    window.__vidTitle = "Neon Bars (video test)";
    window.__clipTitle = target.title;
    window.__gifTitle = all[1]?.title ?? "";
    return true;
  });
  if (ok !== true) throw new Error(String(ok));
});

await step("play-video-track", async () => {
  const title = await playByTitle("__vidTitle");
  await sleep(1200);
  await pauseEngine();
  if (!title) throw new Error("injected track not found");
  const st = await page.evaluate(() => {
    const e = window.__atori.engine;
    return { current: e.current?.title, hasVideo: e.current?.hasVideo, err: e.el.error?.code ?? null };
  });
  if (st.current !== title) throw new Error(`engine current is ${st.current}`);
  if (!st.hasVideo) throw new Error("hasVideo flag lost");
  if (st.err) throw new Error(`media error ${st.err}`);
});

await step("now-playing-side-panel", async () => {
  await openNowPlaying();
  const st = await page.evaluate(() => {
    const v = document.querySelector("video");
    if (!v) return { has: false };
    const r = v.getBoundingClientRect();
    return { has: true, w: Math.round(r.width), ready: v.readyState };
  });
  if (!st.has || st.w < 150) throw new Error(`visual panel video missing/too small: ${JSON.stringify(st)}`);
  await shot("11-video-sidebar");
});

await step("video-decodes-frames", async () => {
  const diff = await page.evaluate(async () => {
    const v = document.querySelector("video");
    if (!v) return -1;
    v.muted = true;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 36;
    const ctx = c.getContext("2d");
    const grab = () => {
      ctx.drawImage(v, 0, 0, 64, 36);
      return ctx.getImageData(0, 0, 64, 36).data.reduce((a, b, i) => a + (i % 97 === 0 ? b : 0), 0);
    };
    if (v.readyState < 2) await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }));
    const seek = (f) =>
      new Promise((r) => {
        v.addEventListener("seeked", r, { once: true });
        v.currentTime = f;
      });
    await seek(Math.min(0.2, v.duration || 1));
    const a = grab();
    await seek(Math.max(0, (v.duration || 2) - 0.2));
    const b = grab();
    return Math.abs(a - b);
  });
  if (diff < 0) throw new Error("no video element");
  if (diff === 0) throw new Error("frames identical: video not decoding");
});

await step("theatre-mode", async () => {
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /THEATRE/.test(x.textContent ?? ""));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!clicked) throw new Error("THEATRE button missing");
  await sleep(1400);
  const st = await page.evaluate(() => {
    const v = document.querySelector("main video");
    if (!v) return { big: false };
    const r = v.getBoundingClientRect();
    return { big: r.width > 500 && r.height > 280, w: Math.round(r.width), h: Math.round(r.height) };
  });
  if (!st.big) throw new Error(`theatre video too small: ${JSON.stringify(st)}`);
  await shot("12-theatre");
});

await step("fullscreen-stage", async () => {
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.getAttribute("aria-label") ?? "") === "Enter fullscreen",
    );
    if (b) { b.click(); return true; }
    return false;
  });
  if (!clicked) throw new Error("fullscreen icon button missing");
  await sleep(1200);
  const st = await page.evaluate(() => {
    const fsEl = document.fullscreenElement;
    const r = fsEl?.getBoundingClientRect();
    return {
      active: !!fsEl,
      covers: !!fsEl && r.width >= window.innerWidth * 0.95 && r.height >= window.innerHeight * 0.95,
    };
  });
  if (!st.active || !st.covers) throw new Error(`fullscreen not active/covers screen: ${JSON.stringify(st)}`);
  await shot("16-fullscreen");
  await page.evaluate(() => document.exitFullscreen());
  await sleep(800);
  const off = await page.evaluate(() => !document.fullscreenElement);
  if (!off) throw new Error("fullscreen did not exit");
});

await step("attached-clip-visual", async () => {
  await closeNowPlaying();
  await playByTitle("__clipTitle");
  await sleep(1200);
  await pauseEngine();
  await openNowPlaying();
  const kind = await page.evaluate(() => {
    const v = document.querySelector("video");
    const tag = [...document.querySelectorAll("main, main *")].find((d) => /CLIP|GIF|VIDEO/.test(d.textContent ?? "") && d.children.length === 0)?.textContent;
    return { hasVideo: !!v, tag };
  });
  if (!kind.hasVideo) throw new Error("attached clip not rendering a <video>");
  const body = await page.evaluate(() => document.body.innerText);
  if (!kind.tag && !/CLIP/i.test(body)) {
    await shot("fail-clip.png");
    throw new Error("CLIP tag missing");
  }
  await shot("13-attached-clip");
});

await step("gif-visual", async () => {
  const gifTitle = await page.evaluate(() => window.__gifTitle ?? "");
  if (!gifTitle) {
    console.log("     (no second demo track: skipped)");
    return;
  }
  await closeNowPlaying();
  await playByTitle("__gifTitle");
  await sleep(1200);
  await pauseEngine();
  await openNowPlaying();
  const st = await page.evaluate(() => {
    const img = [...document.querySelectorAll("img")].find((i) => (i.src || "").startsWith("blob:"));
    const tag = [...document.querySelectorAll("main *")].find((d) => /GIF/.test(d.textContent ?? "") && d.children.length === 0)?.textContent;
    return { img: !!img, tag };
  });
  if (!st.img) throw new Error("gif visual not rendering an <img>");
  const body = await page.evaluate(() => document.body.innerText);
  if (!st.tag && !/GIF/i.test(body)) {
    await shot("fail-gif.png");
    throw new Error("GIF tag missing");
  }
  await shot("14-gif-visual");
});

await step("flat-layout-visual", async () => {
  await closeNowPlaying();
  await openNowPlaying();
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^FLAT/.test((x.textContent ?? "").trim()));
    if (b) b.click();
  });
  await sleep(1300);
  const st = await page.evaluate(() => {
    const v = document.querySelector("main video, main img");
    const flatBtn = [...document.querySelectorAll("button")].find((x) => /^FLAT/.test((x.textContent ?? "").trim()));
    if (!v) return { ok: false, flatActive: flatBtn?.textContent ?? "?", mainLen: document.querySelector("main")?.innerHTML.length ?? 0 };
    const r = v.getBoundingClientRect();
    return { ok: r.width > 200 && r.height > 200, flatActive: flatBtn?.textContent ?? "?", w: Math.round(r.width) };
  });
  if (!st.ok) {
    await shot("fail-flat.png");
    throw new Error("flat visual missing: " + JSON.stringify(st));
  }
  await shot("15-flat-visual");
});

console.log(problems.length === 0 ? "\nVIDEO/GIF QA PASS" : `\n${problems.length} PROBLEM(S):`);
for (const p of problems) console.log("  ", p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
