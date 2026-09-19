/**
 * BgStyles — selectable background animation bodies, orthogonal to skins.
 *
 * Each body is GLSL implementing `vec3 BG(vec2 p)` (p = aspect-corrected
 * centered coords) using the shared PRELUDE helpers (hash/noise/fbm/glow) and
 * uniforms. ShaderStage composes the chosen body with the active skin's
 * palette + post recipe, so every style is tinted by whatever skin is active.
 *
 * Conventions shared with skin bodies:
 *  - motion is uTime-driven → CALM MODE freezes every style automatically
 *  - every style is band-reactive: elements own slices of uBands (bass → treble)
 *    so the kick, vocals and highs each have a visual home
 *  - audio only ever modulates amplitude/brightness — sweep speeds stay constant
 *  - `uQuality` branches drop expensive detail on lower settings
 */

export interface BgStyleDef {
  id: string;
  name: string;
  nameJp: string;
  blurb: string;
  body: string;
}

export const BG_STYLES: BgStyleDef[] = [
  {
    id: "starfield",
    name: "STARFIELD",
    nameJp: "星海",
    blurb: "band-owned constellations — every star pulses with its own slice",
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime;
  float react = 1.0 - uCalm;
  float warp = clamp(uLevel * 0.9 + uBass * 0.55, 0.0, 1.4);
  float rad = length(p);
  vec2 dir = normalize(p + vec2(1e-4, 1e-4));

  vec3 col = mix(uC * 1.5, uC * 0.75, smoothstep(-0.7, 0.9, p.y));

  // three parallax layers; each layer also leans on its own band slice
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer) + 1.0;
    float layerBand = texture2D(uBands, vec2(0.18 + fl * 0.22, 0.5)).r;
    vec2 sp = p * (3.0 + fl * 2.6);
    sp.y += t * (0.05 + 0.04 * fl);
    sp *= 1.0 + warp * 0.05 * fl;
    vec2 cell = floor(sp);
    vec2 f = fract(sp) - 0.5;
    float rnd = hash(cell + fl * 17.0);
    float star = step(0.962 - fl * 0.004, rnd);
    vec2 off = (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
    float d = length(f - off - dir * warp * 0.22 * rad);
    // every star owns a stable random band — the music lights them individually
    float sband = texture2D(uBands, vec2(fract(rnd * 9.0), 0.5)).r;
    float tw = 0.55 + 0.45 * sin(t * (1.4 + rnd * 2.2) + rnd * 40.0);
    col += star * tw * (0.35 + sband * 1.5 * react + layerBand * 0.35 * react)
      * smoothstep(0.16 + warp * 0.12, 0.0, d)
      * mix(vec3(1.0), mix(uA, uB, rnd), 0.6) * (0.55 / fl);
  }

  if (uQuality > 0.5) {
    col += glow(p, vec2(0.0), 0.5 + uBass * 0.3, mix(uA, uB, 0.4)) * 0.16;
    col += uImpact * 0.14 * exp(-rad * 1.8) * mix(uA, uB, 0.5);
  }
  return col;
}`,
  },
  {
    id: "digital-rain",
    name: "NEON GRID",
    nameJp: "ネオングリッド",
    blurb: "disco floor with a front-row spectrum — kick left, highs right",
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime;
  float react = 1.0 - uCalm;
  vec3 col = mix(uC * 1.35, uC * 0.7, smoothstep(-0.8, 0.9, p.y));

  // disco floor grid of blocky panels
  vec2 cells = vec2(22.0, 13.0);
  vec2 g = (p * 0.5 + 0.5) * cells;
  vec2 id = floor(g);
  vec2 f = fract(g);

  // thin gaps make the panels read as separate tiles
  vec2 inPanel = smoothstep(vec2(0.02, 0.02), vec2(0.10, 0.10), f)
               * smoothstep(vec2(0.98, 0.98), vec2(0.90, 0.90), f);

  float rnd = hash(id);
  float rnd2 = hash(id + 19.0);
  float on = step(0.35, rnd2); // most panels stay dark; a few carry the light

  // every column owns one FFT slice (bass left → highs right), strongest at the front
  float band = texture2D(uBands, vec2((id.x + 0.5) / cells.x, 0.5)).r;
  float eqWeight = mix(1.0, 0.2, clamp(id.y / cells.y, 0.0, 1.0));

  // diagonal wave sweeping at constant speed — the wave must never change
  // velocity (that reads as rubber-banding); the beat enters via brightness
  float phase = fract((id.x + id.y * 0.7) / 40.0 + t * 0.35 + rnd * 0.15);
  float groove = smoothstep(0.0, 0.4, phase) * smoothstep(1.0, 0.6, phase);
  groove *= groove; // concentrate light into the wave crest

  // smooth color morph between the two skin accents (no snapping)
  vec3 tint = mix(uA, uB, 0.5 + 0.5 * sin(t * 0.5 + rnd * 6.2831853));

  float swell = 0.35 + uBass * 0.45 + uLevel * 0.35; // whole-floor pulse
  float base = groove * swell * on;

  // legacy disco floor, plus a frequency-mapped band layer on every panel
  vec3 floorCol = tint * inPanel.x * inPanel.y * (0.015 + base * 0.8);
  vec3 eqTint = mix(uA, uB, (id.x + 0.5) / cells.x);
  vec3 bandCol = eqTint * inPanel.x * inPanel.y * band * (0.25 + 0.75 * eqWeight) * react;

  col += floorCol + bandCol;
  return col;
}`,
  },
  {
    id: "aurora",
    name: "AURORA",
    nameJp: "極光",
    blurb: "four band-owned curtains — the kick swells low, highs shimmer above",
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime * 0.05;
  float react = 1.0 - uCalm;
  vec3 col = mix(uC * 1.55, uC * 0.8, smoothstep(-0.7, 0.9, p.y));

  // star dust; treble lifts the sparkle
  float st = hash(floor(p * 40.0));
  col += step(0.995, st) * (0.25 + uTreble * 0.35 * react) * mix(vec3(1.0), uB, 0.4);

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    if (fi < 1.5 || uQuality > 0.6) {
      // each curtain owns its own slice of the spectrum (low near the ground)
      float band = texture2D(uBands, vec2(0.12 + fi * 0.24, 0.5)).r;
      float yBase = -0.2 + fi * 0.24;
      float wobble = fbm(vec2(p.x * (1.1 + fi * 0.4) + t * (0.8 + fi * 0.5), t * 0.6 + fi * 3.0));
      float y = yBase + (wobble - 0.5) * (0.5 + band * 0.45 * react);
      float d = p.y - y;
      float curtain = exp(-abs(d) * (9.0 - fi * 1.6));
      curtain *= smoothstep(-0.9, 0.2, d + 0.25);
      vec3 tint = mix(uA, uB, 0.3 + 0.35 * sin(t * 2.0 + fi * 2.1));
      col += tint * curtain * (0.14 + band * 0.55 * react);
    }
  }

  // ground haze
  col += glow(p, vec2(0.0, -0.85), 0.8, mix(uA, uB, 0.5)) * 0.10;
  return col;
}`,
  },
  {
    id: "pulse",
    name: "BEAT SHARDS",
    nameJp: "ビートシャード",
    blurb: "32-band shard equalizer — kick, vocals and highs own their shards",
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime;
  float react = 1.0 - uCalm;
  vec3 col = mix(uC * 1.45, uC * 0.75, smoothstep(-0.7, 0.9, p.y));

  // slanted shard stage — parallelogram bars echoing the UI's clip-slash shapes
  float slant = 0.38;
  float pitch = 0.075;
  float gap = 0.016;
  float xs = p.x + p.y * slant;

  float bi = floor(xs / pitch);
  float bf = fract(xs / pitch);
  float xb = bf * pitch;
  float hch = hash(vec2(bi, 11.0));

  float inBarX = step(gap, xb) * step(xb, pitch - gap);

  // each shard owns one slice of the FFT: bass on the left → highs on the right
  float u = fract((bi + 0.5) / 32.0);
  float band = texture2D(uBands, vec2(u, 0.5)).r;

  // bar height: spectrum-driven, with slow per-bar breathing for idle life
  float breathe = 0.05 * sin(t * (0.8 + hch * 0.6) + hch * 6.2831853);
  float halfH = 0.04 + band * (0.30 + hch * 0.18) * react + breathe + hch * 0.025;
  halfH = min(halfH, 0.5);

  float d = abs(p.y);
  float barMask = inBarX * step(d, halfH);
  float tipFade = 1.0 - 0.45 * smoothstep(halfH * 0.6, halfH, d);

  // frequency-map tint: bass side wears uA, high side wears uB, loud bands lift
  vec3 tint = mix(uA, uB, fract((bi + 0.5) / 32.0));

  // center slash line through the stage
  float line = exp(-pow(p.y * 160.0, 2.0));

  // stage edge fade
  float stage = smoothstep(1.7, 1.1, abs(p.x));

  col += mix(tint, vec3(1.0), band * 0.25) * barMask * tipFade * (0.28 + band * 0.4) * stage;
  col += mix(uA, uB, 0.4) * line * stage * (0.30 + uLevel * 0.2);

  return col;
}`,
  },
  {
    id: "halftone",
    name: "HALFTONE PULSE",
    nameJp: "ハーフトーンパルス",
    blurb: "print-grid dots — each column breathes with its own band",
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime;
  float react = 1.0 - uCalm;
  vec3 col = mix(uC * 1.4, uC * 0.7, smoothstep(-0.8, 0.9, p.y));

  // slanted halftone grid — each column owns one FFT slice
  float slant = 0.3;
  vec2 q = vec2(p.x + p.y * slant, p.y);
  vec2 cells = vec2(34.0, 20.0);
  vec2 g = q * cells;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;

  float cu = (id.x + 0.5) / cells.x;
  float band = texture2D(uBands, vec2(cu, 0.5)).r;

  // dots breathe slowly for idle life; bands lift their size — never speed
  float rnd = hash(id);
  float breathe = 0.012 * sin(t * (0.7 + rnd) + rnd * 6.2831853);
  float r = 0.045 + band * (0.16 + rnd * 0.08) * react + breathe;
  float dd = length(f);
  float spot = smoothstep(r, r - 0.05, dd);

  // constant-speed diagonal sheen passing over the print
  float sweep = exp(-pow((cu + p.y * 0.1 - fract(t * 0.11)) * 6.0, 2.0));

  vec3 tint = mix(uA, uB, cu);
  col += tint * spot * (0.10 + band * 0.85 * react + sweep * 0.12);
  return col;
}`,
  },
  {
    id: "stream",
    name: "DATA STREAM",
    nameJp: "データストリーム",
    blurb: "slanted falling streams — columns light up bass to treble",
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime;
  float react = 1.0 - uCalm;
  vec3 col = mix(uC * 1.3, uC * 0.7, smoothstep(-0.8, 0.9, p.y));

  // slanted falling streams — each column owns one FFT slice
  float slant = 0.12;
  float cols = 42.0;
  float xs = (p.x + p.y * slant) * 0.5 + 0.5;
  float ci = floor(xs * cols);
  float cu = (ci + 0.5) / cols;
  float band = texture2D(uBands, vec2(cu, 0.5)).r;

  float rnd = hash(vec2(ci, 3.0));
  // dashes fall at constant speed; the band sets their length + brightness
  float y = p.y * 0.5 + 0.5;
  float dash = fract(y * (3.0 + rnd * 3.0) + t * (0.25 + rnd * 0.35) + rnd * 7.0);
  float len = 0.08 + band * 0.30 * react;
  float streak = smoothstep(len, 0.0, abs(dash - 0.5));
  // second dimmer layer for depth
  float dash2 = fract(y * (5.0 + rnd * 2.0) - t * (0.18 + rnd * 0.2) + rnd * 13.0);
  float streak2 = smoothstep(len * 0.6, 0.0, abs(dash2 - 0.5)) * 0.45;

  vec3 tint = mix(uA, uB, cu);
  col += tint * (streak + streak2) * (0.12 + band * 0.9 * react) * (0.5 + rnd * 0.5);
  col += tint * band * 0.05 * react; // faint column glow so the spectrum reads
  return col;
}`,
  },
  {
    id: "weave",
    name: "CHROMA WEAVE",
    nameJp: "クロマウィーブ",
    blurb: "woven ribbon families — bass wide, mids steady, treble quick",
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime;
  float react = 1.0 - uCalm;
  vec3 col = mix(uC * 1.45, uC * 0.72, smoothstep(-0.8, 0.9, p.y));

  // three ribbon families: bass weaves wide, mids steady, treble thin + quick
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    if (fi < 1.5 || uQuality > 0.6) {
      float ang = 0.5 + fi * 0.55;
      float ca = cos(ang);
      float sa = sin(ang);
      vec2 q = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
      float band = texture2D(uBands, vec2(0.14 + fi * 0.3, 0.5)).r;
      float rep = 5.0 + fi * 3.0;
      float weave = sin(q.x * rep + t * (0.4 + fi * 0.25) + fi * 2.2) * (0.16 + fi * 0.05);
      float lines = abs(fract(q.y * (3.0 + fi) + weave) - 0.5);
      float w = 0.05 + band * 0.16 * react; // ribbon width = amplitude
      float ribbon = smoothstep(w, 0.0, lines);
      vec3 tint = mix(uA, uB, fi * 0.5);
      col += tint * ribbon * (0.10 + band * 0.55 * react);
    }
  }
  return col;
}`,
  },
  {
    id: "slabs",
    name: "WAVE SLABS",
    nameJp: "ウェーブスラブ",
    blurb: "strata slabs — eight chunky spectrum bands with glowing edges",
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime;
  float react = 1.0 - uCalm;
  vec3 col = mix(uC * 1.3, uC * 0.7, smoothstep(-0.9, 0.9, p.y));

  // thick strata — 8 chunks of the spectrum, kick at the bottom
  float n = 8.0;
  float slant = 0.06;
  float xs = p.x + p.y * slant;
  float si = floor((p.y + 1.0) * 0.5 * n);
  float sf = fract((p.y + 1.0) * 0.5 * n);
  float u = (si + 0.5) / n;
  float band = texture2D(uBands, vec2(u, 0.5)).r;

  float rnd = hash(vec2(si, 5.0));
  // each slab's top edge glows with its band; a slow sheen drifts across
  float edge = exp(-pow((sf - 0.92) * 26.0, 2.0));
  float sheen = exp(-pow((xs - fract(t * 0.07 + rnd) * 4.0 - 2.0) * 1.4, 2.0));
  float body = (0.015 + band * 0.05 * react) * (0.4 + sheen * 0.6);
  vec3 tint = mix(uA, uB, u);

  col += tint * (edge * (0.10 + band * 0.75 * react) + body);
  col += mix(uA, uB, 0.5) * exp(-pow(sf * 120.0, 2.0)) * 0.10; // seam line
  return col;
}`,
  },
];

export function getBgStyle(id: string): BgStyleDef | null {
  return BG_STYLES.find((s) => s.id === id) ?? null;
}
