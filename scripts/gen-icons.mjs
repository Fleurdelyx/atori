/**
 * Tauri icon generator — stdlib only. Draws the ATRI slash logo
 * (charcoal field, magenta slash, waveform bars) at 512/128/32.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "icons");
mkdirSync(OUT, { recursive: true });

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

function drawIcon(S) {
  const px = Buffer.alloc(S * S * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  const u = S / 512; // design-unit scale
  // charcoal field, rounded feel via corner cut
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cut = 64 * u;
      const inCut = x + y < cut || x + y > 2 * S - cut;
      if (!inCut) set(x, y, 0x12, 0x12, 0x1c);
    }
  }
  // magenta slash (diagonal parallelogram)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = x - (0.62 * S - y * 0.35);
      if (d > 0 && d < 26 * u) set(x, y, 0xff, 0x2e, 0x88);
    }
  }
  // waveform bars (cyan, gold)
  const bars = [
    [96, 120, 0x00, 0xe5, 0xff],
    [150, 190, 0x00, 0xe5, 0xff],
    [204, 140, 0xff, 0xcf, 0x5c],
    [258, 210, 0x00, 0xe5, 0xff],
    [312, 160, 0xff, 0xcf, 0x5c],
    [366, 100, 0x00, 0xe5, 0xff],
  ];
  for (const [bx, bh, r, g, b] of bars) {
    const x0 = bx * u;
    const w = 26 * u;
    const h = bh * u;
    const y0 = (S + h) / 2 - h * 0.08;
    for (let y = Math.round(y0 - h); y < Math.round(y0); y++) {
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) {
        set(x, y, r, g, b);
      }
    }
  }
  return px;
}

for (const size of [512, 128, 32]) {
  const name = size === 512 ? "icon.png" : `${size}x${size}.png`;
  writeFileSync(join(OUT, name), encodePng(size, drawIcon(size)));
  console.log("wrote", name);
}

/** ICO wrapper: PNG-compressed entries (Vista+ format). */
function makeIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + 16 * count;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const ico = makeIco([
  { size: 32, data: encodePng(32, drawIcon(32)) },
  { size: 256, data: encodePng(256, drawIcon(256)) },
]);
writeFileSync(join(OUT, "icon.ico"), ico);
console.log("wrote icon.ico");
