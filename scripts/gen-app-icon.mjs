/**
 * ATRI app-icon generator — the cut-slash vinyl.
 * Rounded-square charcoal tile, gradient vinyl disc with groove rings,
 * the signature diagonal slash cutting through it (cyan-edged), spindle
 * ring, and a small anime sparkle accent.
 *
 * Renders every icon the project ships: src-tauri/icons/* (png set + ico)
 * and public/icons/* (PWA) — plus a favicon. Stdlib only.
 *
 *   node scripts/gen-app-icon.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAURI_OUT = join(ROOT, "src-tauri", "icons");
const PWA_OUT = join(ROOT, "public", "icons");
mkdirSync(TAURI_OUT, { recursive: true });
mkdirSync(PWA_OUT, { recursive: true });

/* ---------- png encoding (same scheme as gen-icons.mjs) ---------- */

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}

function makeIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + 16 * count;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

/* ---------- palette ---------- */

const BG_TOP = [46, 38, 82]; // #2e2652 dark violet
const BG_BOT = [17, 15, 32]; // #110f20
const DISC_A = [255, 95, 158]; // hot magenta (inner)
const DISC_B = [172, 36, 98]; // deep plum (outer)
const GROOVE = [140, 22, 82]; // groove band
const CYAN = [82, 216, 232]; // #52d8e8
const GOLD = [255, 215, 110]; // #ffd76e
const WHITE = [255, 255, 255];

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const smooth = (edge0, edge1, x) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/* ---------- the design, drawn at BASE resolution ---------- */

const BASE = 1024; // drawn 2x, box-downscaled for anti-aliasing
const S = 2;
const SIZE = 512;
const CORNER = 210;
const CX = 512;
const CY = 512;
const DISC_R = 386;
const WEDGE = 46; // half-width of the cut slash (base units)
const SLASH_DIR = (-117 * Math.PI) / 180; // slash angle: up-right to down-left

function drawBase() {
  const px = Buffer.alloc(BASE * BASE * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= BASE || y >= BASE) return;
    const i = (y * BASE + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  const ux = Math.cos(SLASH_DIR);
  const uy = Math.sin(SLASH_DIR);

  for (let y = 0; y < BASE; y++) {
    for (let x = 0; x < BASE; x++) {
      // tile: rounded square with a vertical gradient, corners transparent
      const grad = y / BASE;
      let col = mix(BG_TOP, BG_BOT, grad);
      const cr = CORNER;
      const nx = Math.max(cr - x, 0, x - (BASE - cr));
      const ny = Math.max(cr - y, 0, y - (BASE - cr));
      const outsideCorner = Math.hypot(nx, ny) > cr && (x < cr || x > BASE - cr) && (y < cr || y > BASE - cr);
      const outsideRect = x < 0 || y < 0;
      let alpha = 255;
      if (outsideCorner || outsideRect) {
        set(x, y, 0, 0, 0, 0);
        continue;
      }
      // corner edge anti-alias: fade the outermost 3px of the round corner
      const cornerEdge = Math.hypot(nx, ny) - cr;
      if ((x < cr || x > BASE - cr) && (y < cr || y > BASE - cr) && cornerEdge > -3) {
        alpha = Math.round(255 * (1 + cornerEdge / 3));
        alpha = Math.max(0, Math.min(255, alpha));
      }

      // vinyl disc (polar)
      const dx = x - CX;
      const dy = y - CY;
      const r = Math.hypot(dx, dy);
      const perp = dx * uy - dy * ux; // signed distance to the slash axis
      const inWedge = Math.abs(perp) < WEDGE;
      // cyan lip along the upper edge of the cut (outside the band)
      if (r <= DISC_R && !inWedge && perp < -WEDGE && perp > -WEDGE - 16) {
        const t = 1 - (-perp - WEDGE) / 16;
        const c = mix(CYAN, DISC_A, 0.3 * (1 - t));
        set(x, y, c[0], c[1], c[2], alpha);
        continue;
      }
      if (r <= DISC_R && !inWedge) {
        // base gradient + groove rings + angular sheen
        const t = r / DISC_R;
        let c = mix(DISC_A, DISC_B, smooth(0.05, 0.95, t));
        const grooveT = ((r - 48) % 40) / 40;
        if (r > 48 && grooveT < 0.18) c = mix(c, GROOVE, 0.5 * (1 - grooveT / 0.18));
        const sheen = 0.5 * Math.cos(Math.atan2(dy, dx) - 2.35) + 0.5;
        if (sheen > 0.45) c = mix(c, WHITE, (sheen - 0.45) * 0.55);
        // outer rim line
        if (r > DISC_R - 10) c = mix(c, DISC_B, 0.6);
        set(x, y, c[0], c[1], c[2], alpha);
        continue;
      }
      // spindle ring (cyan) over the cut
      if (r <= 76 && r >= 62) {
        set(x, y, CYAN[0], CYAN[1], CYAN[2], alpha);
        continue;
      }
      // sparkle: small 4-point star, top-right quadrant
      const sx = x - 812;
      const sy = y - 200;
      if (Math.hypot(sx, sy) < 66) {
        const a = Math.atan2(sy, sx);
        const spikes = Math.pow(Math.abs(Math.cos(2 * a)), 6);
        const body = 1 - Math.hypot(sx, sy) / 66;
        if (spikes * 1.15 + body * 0.5 > 0.85) {
          set(x, y, GOLD[0], GOLD[1], GOLD[2], alpha);
          continue;
        }
      }
      set(x, y, col[0], col[1], col[2], alpha);
    }
  }
  if (process.env.ICON_DEBUG) {
    const at = (x, y) => px[(y * BASE + x) * 4 + 3];
    console.error("DEBUG alpha @512,512:", at(512, 512), "@512,300:", at(512, 300), "@100,100:", at(100, 100));
  }
  return px;
}

/* ---------- box-downscale ---------- */

function downscale(src, srcSize, dstSize) {
  const out = Buffer.alloc(dstSize * dstSize * 4);
  const f = srcSize / dstSize;
  if (process.env.ICON_DEBUG && dstSize === 512) {
    const si = (512 * S * srcSize + 512 * S) * 4;
    console.error("DEBUG downscale src alpha@(1024,1024):", src[si + 3], "f:", f);
  }
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = Math.floor(y * f); sy < Math.floor((y + 1) * f); sy++) {
        for (let sx = Math.floor(x * f); sx < Math.floor((x + 1) * f); sx++) {
          const i = (sy * srcSize + sx) * 4;
          const wa = src[i + 3] / 255;
          r += src[i] * wa; g += src[i + 1] * wa; b += src[i + 2] * wa; a += src[i + 3];
          n++;
        }
      }
      const o = (y * dstSize + x) * 4;
      const alpha = a / n;
      out[o] = alpha > 0 ? Math.round(r / (alpha / 255) / n) : 0;
      out[o + 1] = alpha > 0 ? Math.round(g / (alpha / 255) / n) : 0;
      out[o + 2] = alpha > 0 ? Math.round(b / (alpha / 255) / n) : 0;
      out[o + 3] = Math.round(alpha);
    }
  }
  return out;
}

/* ---------- emit ---------- */

const base = drawBase();
const render = (size) => (size === BASE ? Buffer.from(base) : downscale(base, BASE, size));

writeFileSync(join(PWA_OUT, "icon-512.png"), encodePng(512, render(512)));
writeFileSync(join(PWA_OUT, "icon-256.png"), encodePng(256, render(256)));
writeFileSync(join(PWA_OUT, "icon-192.png"), encodePng(192, render(192)));
writeFileSync(join(PWA_OUT, "icon-32.png"), encodePng(32, render(32)));
writeFileSync(join(TAURI_OUT, "icon.png"), encodePng(512, render(512)));
writeFileSync(join(TAURI_OUT, "128x128.png"), encodePng(128, render(128)));
writeFileSync(join(TAURI_OUT, "32x32.png"), encodePng(32, render(32)));
writeFileSync(join(TAURI_OUT, "256x256.png"), encodePng(256, render(256)));
writeFileSync(join(TAURI_OUT, "icon.ico"), makeIco(
  [256, 128, 64, 48, 32, 16].map((s) => ({ size: s, data: encodePng(s, render(s)) })),
));
console.log("wrote src-tauri/icons + public/icons from the cut-slash vinyl design");
