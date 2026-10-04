/**
 * ATORI app-icon generator: the pink star-slash mark (31A artwork).
 * Decodes scripts/assets/31a-icon.png (RGBA, any square size) and resamples
 * it (Catmull-Rom) to every icon the project ships: src-tauri/icons/* (png
 * set + ico) and public/icons/* (PWA), plus public/favicon.png. Stdlib only.
 *
 *   node scripts/gen-app-icon.mjs
 */
import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * A 32bpp DIB (BMP) frame for the ico. Windows only decodes PNG-compressed
 * ico entries at 256x256: the classic LoadImage path used for window-class
 * icons skips smaller PNG frames and falls back to the 256 image scaled down,
 * which turns the 16/32px caption/taskbar icon into mud. Small frames must be
 * raw BMP: BITMAPINFOHEADER (height doubled for the XOR+AND masks) + bottom-up
 * BGRA pixels + an all-zero 1bpp AND mask (alpha comes from the channel).
 */
function encodeBmpFrame(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR + AND mask height
  header.writeUInt16LE(1, 12); // planes
  header.writeUInt16LE(32, 14); // bpp
  const andStride = ((size + 31) >> 5) << 2;
  const andSize = andStride * size;
  header.writeUInt32LE(size * size * 4 + andSize, 20);
  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const si = (y * size + x) * 4; // top-down RGBA
      const di = ((size - 1 - y) * size + x) * 4; // bottom-up BGRA
      xor[di] = rgba[si + 2];
      xor[di + 1] = rgba[si + 1];
      xor[di + 2] = rgba[si];
      xor[di + 3] = rgba[si + 3];
    }
  }
  return Buffer.concat([header, xor, Buffer.alloc(andSize)]);
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

/* ---------- png decoding (the source artwork) ---------- */

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced png unsupported");
    } else if (type === "IDAT") {
      idat.push(data);
    }
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported png: depth ${bitDepth}, color type ${colorType} (want 8-bit RGBA or RGB)`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(width * height * 4);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const prev = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    raw.copy(line, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 0xff;
      else if (filter === 2) line[x] = (line[x] + b) & 0xff;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) line[x] = (line[x] + paeth(a, b, c)) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      px[di] = line[x * channels];
      px[di + 1] = line[x * channels + 1];
      px[di + 2] = line[x * channels + 2];
      px[di + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    prev.set(line);
  }
  return { width, height, px };
}

/* ---------- Catmull-Rom resample (separable, edge-clamped) ---------- */

function resample(src, sw, sh, dw, dh) {
  // Catmull-Rom kernel: 1.5|t|^3 - 2.5|t|^2 + 1 (|t|<=1); -0.5|t|^3 + 2.5|t|^2 - 4|t| + 2 (1<|t|<2)
  const cr = (t) => {
    const a = t < 0 ? -t : t;
    if (a <= 1) return 1.5 * a * a * a - 2.5 * a * a + 1;
    if (a < 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
    return 0;
  };
  const sampleX = new Float32Array(dw * sw * 4);
  const tmp = new Float32Array(dw * sh * 4);
  // horizontal pass: src (sw×sh) → tmp (dw×sh)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < dw; x++) {
      const fx = (x + 0.5) * (sw / dw) - 0.5;
      const x0 = Math.floor(fx);
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let m = -1; m <= 2; m++) {
          const sx = Math.min(sw - 1, Math.max(0, x0 + m));
          acc += src[(y * sw + sx) * 4 + c] * cr(fx - (x0 + m));
        }
        tmp[(y * dw + x) * 4 + c] = acc;
      }
    }
  }
  // vertical pass: tmp → out (dw×dh)
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const fy = (y + 0.5) * (sh / dh) - 0.5;
    const y0 = Math.floor(fy);
    for (let x = 0; x < dw; x++) {
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let m = -1; m <= 2; m++) {
          const sy = Math.min(sh - 1, Math.max(0, y0 + m));
          acc += tmp[(sy * dw + x) * 4 + c] * cr(fy - (y0 + m));
        }
        const v = Math.round(acc);
        out[(y * dw + x) * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return out;
}

/* ---------- emit ---------- */

const art = decodePng(readFileSync(join(ROOT, "scripts", "assets", "31a-icon.png")));
if (art.width !== art.height) throw new Error(`source must be square (got ${art.width}x${art.height})`);
const render = (size) => resample(art.px, art.width, art.height, size, size);

writeFileSync(join(PWA_OUT, "icon-512.png"), encodePng(512, render(512)));
writeFileSync(join(PWA_OUT, "icon-256.png"), encodePng(256, render(256)));
writeFileSync(join(PWA_OUT, "icon-192.png"), encodePng(192, render(192)));
writeFileSync(join(PWA_OUT, "icon-32.png"), encodePng(32, render(32)));
writeFileSync(join(PWA_OUT, "favicon.png"), encodePng(64, render(64)));
writeFileSync(join(ROOT, "public", "favicon.png"), encodePng(64, render(64)));
writeFileSync(join(TAURI_OUT, "icon.png"), encodePng(512, render(512)));
writeFileSync(join(TAURI_OUT, "128x128.png"), encodePng(128, render(128)));
writeFileSync(join(TAURI_OUT, "32x32.png"), encodePng(32, render(32)));
writeFileSync(join(TAURI_OUT, "256x256.png"), encodePng(256, render(256)));
writeFileSync(join(TAURI_OUT, "icon.ico"), makeIco([
  // small frames must be BMP (see encodeBmpFrame): PNG only legal at 256
  ...[16, 32, 48, 64, 128].map((s) => ({ size: s, data: encodeBmpFrame(s, render(s)) })),
  { size: 256, data: encodePng(256, render(256)) },
]));
console.log(`wrote src-tauri/icons + public/icons + favicon.png from ${art.width}x${art.height} source`);
