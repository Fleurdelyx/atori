import type { SkinDef } from "./types";

/**
 * GOD EATER — industrial aragami-hunt theme.
 * Obsidian and gunmetal plates, white HUD type, aragami orange-red accents,
 * hazard chevrons and rising embers. Heavy condensed Teko for the HUD feel.
 */
export const godEater: SkinDef = {
  id: "god-eater",
  name: "GOD EATER",
  nameJp: "ゴッドイーター",
  tagline: "obsidian // gunmetal // aragami red",
  swatch: "linear-gradient(120deg, #ff4d24 0%, #1a1b1e 55%, #0b0b0d 100%)",
  tokens: {
    "--ato-bg": "#0b0b0d",
    "--ato-panel": "#1a1b1ef2",
    "--ato-panel-2": "#232428f0",
    "--ato-text": "#f2f2f0",
    "--ato-text-dim": "#9a9a96",
    "--ato-accent": "#ff4d24",
    "--ato-accent-2": "#c8102e",
    "--ato-gold": "#ffa02e",
    "--ato-border": "#ffffff1f",
    "--ato-danger": "#ff2222",
    "--ato-font-display": "'Teko', 'Chakra Petch', sans-serif",
    "--ato-font-body": "'Chakra Petch', sans-serif",
    "--ato-font-mono": "'JetBrains Mono', monospace",
    "--ato-radius": "0px",
  },
  motion: {
    fast: 0.14,
    base: 0.26,
    slow: 0.55,
    easeOut: "cubic-bezier(0.2, 1, 0.3, 1)",
    easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    easeSlash: "cubic-bezier(0.85, 0, 0.1, 1)",
    spring: { stiffness: 620, damping: 30 },
    shake: 1.3,
  },
  shader: {
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime * 0.3;
  float react = 1.0 - uCalm;
  vec3 col = mix(uC * 1.4, uC * 0.65, smoothstep(-0.7, 0.9, p.y));

  // faint tech grid across the field
  float gx = gridLine(p.x * 5.5, 0.02);
  float gy = gridLine(p.y * 5.5, 0.02);
  col += (gx + gy) * vec3(0.55, 0.56, 0.60) * 0.045;

  // hazard chevron bands: diagonal red/black stripes sliding along their axis
  float ca = cos(-0.5);
  float sa = sin(-0.5);
  vec2 hp = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
  float slide = t * (0.35 + uBass * 0.25) * react;
  float chev = step(0.5, fract((hp.x + hp.y * 0.35) * 1.6 - slide));
  float band1 = smoothstep(0.30, 0.14, abs(hp.y - 0.45));
  float band2 = smoothstep(0.22, 0.10, abs(hp.y + 0.72));
  vec3 haz = mix(uC * 0.9, uA, chev);
  col += haz * band1 * (0.30 + uLevel * 0.35) * react * 0.55;
  col += haz * band2 * (0.18 + uLevel * 0.2) * react * 0.35;

  // aragami core glow, low center, breathing with the bass
  vec2 core = vec2(0.0, -0.42);
  float pulse = 0.42 + uBass * 0.30 + 0.05 * sin(t * 5.0);
  col += glow(p, core, pulse, uA) * (0.55 + uLevel * 0.35) * react;
  col += glow(p, core, pulse * 0.45, vec3(1.0, 0.85, 0.7)) * 0.12 * react;

  // rising embers: orange dots drifting upward, twinkling with treble
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer) + 1.0;
    vec2 ep = p * (3.0 + fl * 1.8);
    ep.y -= t * (0.35 + fl * 0.25) * react;
    vec2 cell = floor(ep);
    vec2 fr = fract(ep) - 0.5;
    float rnd = hash(cell + fl * 23.0);
    float ember = step(0.93, rnd);
    vec2 off = (vec2(hash(cell + 3.3), hash(cell + 8.8)) - 0.5) * 0.5;
    float d = length(fr - off);
    float tw = 0.5 + 0.5 * sin(t * (1.5 + rnd * 3.0) + rnd * 30.0 + uTreble * 5.0);
    col += ember * tw * smoothstep(0.10, 0.0, d) * mix(uA, vec3(1.0, 0.75, 0.45), rnd) * (0.4 / fl);
  }

  // impact: red hazard flash bar
  if (uImpact > 0.01) {
    float jag = sin(hp.y * 36.0 + uTime * 9.0) * 0.02;
    float flash = exp(-pow((hp.x - (0.45 - uImpact * 1.0) + jag) * 18.0, 2.0));
    col += uA * flash * uImpact * 0.7 * react;
  }
  return col;
}`,
    grain: 0.07,
    scanlines: 0.05,
    vignette: 0.5,
  },
  particles: { kind: "shards" },
  fonts: { display: "Teko", body: "Chakra Petch", mono: "JetBrains Mono" },
};
