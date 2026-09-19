/**
 * Demo library generator — dev fixture, stdlib only.
 * Synthesizes small WAV tracks (PCM 16-bit 22.05kHz mono) with ID3v2.3
 * tags (TIT2/TPE1/TALB/TCON/TYER/TRCK + APIC cover) and generates
 * procedural PNG cover art. Output: public/demo-library/
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "demo-library");
mkdirSync(OUT, { recursive: true });

/* ---------------- PNG encoder (RGBA, no filter tricks) ---------------- */

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

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- procedural covers ---------------- */

function makeCover(palette, motif) {
  const S = 512;
  const px = Buffer.alloc(S * S * 4);
  const [c1, c2, accent] = palette;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = hex(c1);
  const [r2, g2, b2] = hex(c2);
  const [ar, ag, ab] = hex(accent);
  const set = (x, y, r, g, b) => {
    const i = (y * S + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const t = (x / S + y / S) / 2;
      let r = r1 + (r2 - r1) * t;
      let g = g1 + (g2 - g1) * t;
      let b = b1 + (b2 - b1) * t;
      const cx = x - S / 2;
      const cy = y - S / 2;
      const d = Math.hypot(cx, cy);
      if (motif === "sun") {
        // big sun disc + horizon slats
        if (d < 130) {
          const band = y % 42 < 12 && y > S / 2 ? 0.45 : 1;
          r = ar * band + r * (1 - band);
          g = ag * band + g * (1 - band);
          b = ab * band + b * (1 - band);
        }
      } else if (motif === "wave") {
        const w = Math.sin((x / S) * Math.PI * 3 + y * 0.02) * 40;
        if (Math.abs(cy - w) < 9) {
          r = ar;
          g = ag;
          b = ab;
        }
      } else if (motif === "stars") {
        const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        if (n - Math.floor(n) > 0.995 || d < 60) {
          r = ar;
          g = ag;
          b = ab;
        }
      }
      set(x, y, r | 0, g | 0, b | 0);
    }
  }
  return encodePng(S, S, px);
}

/* ---------------- ID3v2.3 ---------------- */

function textFrame(id, text) {
  const payload = Buffer.concat([Buffer.from([0x00]), Buffer.from(text, "latin1"), Buffer.from([0x00])]);
  return frameWith(id, payload);
}

function apicFrame(png) {
  const payload = Buffer.concat([
    Buffer.from([0x00]),
    Buffer.from("image/png", "latin1"),
    Buffer.from([0x00]),
    Buffer.from([0x03]), // front cover
    Buffer.from([0x00]), // empty description
    png,
  ]);
  return frameWith("APIC", payload);
}

function usltFrame(text) {
  const payload = Buffer.concat([
    Buffer.from([0x00]), // ISO-8859-1
    Buffer.from("eng", "latin1"),
    Buffer.from([0x00]), // empty descriptor
    Buffer.from(text, "latin1"),
  ]);
  return frameWith("USLT", payload);
}

/** Build simple LRC-timed lyrics spread over the track duration. */
function makeLyrics(lines, durationSec) {
  const step = durationSec / (lines.length + 1);
  return lines
    .map((text, i) => {
      const t = (i + 1) * step;
      const mm = String(Math.floor(t / 60)).padStart(2, "0");
      const ss = String(Math.floor(t % 60)).padStart(2, "0");
      const xx = String(Math.floor((t % 1) * 100)).padStart(2, "0");
      return `[${mm}:${ss}.${xx}] ${text}`;
    })
    .join("\n");
}

function frameWith(id, payload) {
  const head = Buffer.alloc(10);
  head.write(id, 0, "ascii");
  head.writeUInt32BE(payload.length, 4);
  return Buffer.concat([head, payload]);
}

function id3Tag({ title, artist, album, genre, year, track, png, lyrics }) {
  const frames = Buffer.concat([
    textFrame("TIT2", title),
    textFrame("TPE1", artist),
    textFrame("TALB", album),
    textFrame("TCON", genre),
    textFrame("TYER", String(year)),
    textFrame("TRCK", String(track)),
    usltFrame(lyrics),
    apicFrame(png),
  ]);
  const header = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
  const size = Buffer.alloc(4);
  const n = frames.length;
  size[0] = (n >>> 21) & 0x7f;
  size[1] = (n >>> 14) & 0x7f;
  size[2] = (n >>> 7) & 0x7f;
  size[3] = n & 0x7f;
  return Buffer.concat([header, size, frames]);
}

/* ---------------- WAV (PCM 16-bit mono) ---------------- */

function synthWav(seconds, renderFn) {
  const rate = 22050;
  const n = Math.floor(seconds * rate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let v = renderFn(t, i / n);
    v = Math.max(-1, Math.min(1, v));
    data.writeInt16LE((v * 32000) | 0, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Append an 'id3 ' RIFF chunk to a WAV buffer. */
function wavWithId3(wav, tag) {
  const chunk = Buffer.concat([
    Buffer.from("id3 ", "ascii"),
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(tag.length);
      return b;
    })(),
    tag,
  ]);
  const sizePos = 4;
  const total = wav.readUInt32LE(sizePos) + chunk.length;
  wav.writeUInt32LE(total, sizePos);
  return Buffer.concat([wav, chunk]);
}

/* ---------------- tracks ---------------- */

const note = (semisFromA4) => 440 * Math.pow(2, semisFromA4 / 12);

const ALBUMS = [
  {
    album: "Neon Skyline",
    artist: "Kaito Mirage",
    year: 2024,
    genre: "Synthwave",
    palette: ["#2a0a3a", "#0d0221", "#ff2e88"],
    motif: "sun",
    tracks: [
      { title: "Midnight Drive", file: "01 - Midnight Drive.wav", dur: 26, melody: [0, 3, 7, 10, 12, 10, 7, 3], bpm: 100 },
      { title: "Chrome Heart", file: "02 - Chrome Heart.wav", dur: 24, melody: [-2, 2, 5, 10, 14, 10, 5, 2], bpm: 112 },
      { title: "Afterglow", file: "03 - Afterglow.wav", dur: 22, melody: [5, 8, 12, 15, 12, 8], bpm: 92 },
    ],
  },
  {
    album: "Dream Circuit",
    artist: "Aurora Units",
    year: 2025,
    genre: "Electronic",
    palette: ["#0a2a3a", "#02101d", "#00e5ff"],
    motif: "wave",
    tracks: [
      { title: "Parallel Hearts", file: "01 - Parallel Hearts.wav", dur: 25, melody: [-5, -1, 2, 7, 11, 7, 2, -1], bpm: 120 },
      { title: "Signal Bloom", file: "02 - Signal Bloom.wav", dur: 23, melody: [2, 7, 9, 14, 9, 7], bpm: 128 },
    ],
  },
  {
    album: "Starlit Diary",
    artist: "Miku Hashimoto",
    year: 2023,
    genre: "Ambient",
    palette: ["#1a1a3a", "#050510", "#f5d76e"],
    motif: "stars",
    tracks: [
      { title: "Paper Moon", file: "01 - Paper Moon.wav", dur: 27, melody: [0, 4, 7, 11, 14, 11, 7, 4], bpm: 70 },
      { title: "Constellation of Us", file: "02 - Constellation of Us.wav", dur: 25, melody: [-3, 1, 4, 8, 13, 8, 4, 1], bpm: 64 },
    ],
  },
];

const LYRIC_POOL = {
  Synthwave: [
    "Neon signs dissolve in rain",
    "Chrome and heartbeat, all the same",
    "City skyline holds the night",
    "Every window burns with light",
    "We drive until the morning comes",
    "Bassline running through our veins",
    "Pixel stars on black UUIDs",
    "Hold the wheel and dream in frames",
    "The horizon glows like old arcade",
    "Nothing ends, it only fades",
  ],
  Electronic: [
    "Signal bloom inside the wire",
    "Parallel hearts on parallel wire",
    "Circuits humming lullabies",
    "Data flowing through the night",
    "Two machines learning to feel",
    "Every packet signs the deal",
    "Antennae reaching for the sky",
    "Waveforms learn how to cry",
    "Charge the night, complete the loop",
    "System rising, party troop",
  ],
  Ambient: [
    "Paper moon on a cardboard sea",
    "Constellations quietly agree",
    "Streetlight halos, frost on glass",
    "Diary pages turn and pass",
    "Starlight settles on your hair",
    " silence drawn from somewhere rare",
    "The night writes letters none will read",
    "Soft machinery of sleep",
    "Every ending, gentle, slow",
    "Morning comes, we let it go",
  ],
};

let count = 0;
for (const album of ALBUMS) {
  const png = makeCover(album.palette, album.motif);
  writeFileSync(join(OUT, `${album.artist} - ${album.album}.png`), png);
  let trackNo = 1;
  for (const t of album.tracks) {
    const beat = 60 / t.bpm;
    const wav = synthWav(t.dur, (time, prog) => {
      const step = Math.floor(time / (beat / 2)) % t.melody.length;
      const f = note(t.melody[step]);
      const env = Math.exp(-((time % (beat / 2)) * 3));
      const bass = Math.sin(2 * Math.PI * (f / 4) * time) * 0.25;
      const lead = (Math.sin(2 * Math.PI * f * time) * 0.5 + Math.sin(2 * Math.PI * f * 2 * time) * 0.15) * env * 0.5;
      const sparkle = Math.sin(2 * Math.PI * f * 4 * time) * 0.05 * Math.sin(time * 0.7);
      const fade = prog < 0.06 ? prog / 0.06 : prog > 0.92 ? (1 - prog) / 0.08 : 1;
      return (bass + lead + sparkle) * fade;
    });
    const tag = id3Tag({
      title: t.title,
      artist: album.artist,
      album: album.album,
      genre: album.genre,
      year: album.year,
      track: trackNo,
      png,
      lyrics: makeLyrics(LYRIC_POOL[album.genre], t.dur),
    });
    writeFileSync(join(OUT, t.file), wavWithId3(wav, tag));
    count++;
    trackNo++;
  }
}
console.log(`Generated ${count} tracks + ${ALBUMS.length} covers in public/demo-library/`);
