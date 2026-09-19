import type { SkinDef } from "./types";

/**
 * CELESTIAL DARK — indigo night, gold leaf, constellations.
 * Cinematic and calm; serif display type.
 */
export const celestialDark: SkinDef = {
  id: "celestial-dark",
  name: "CELESTIAL",
  nameJp: "星空の帳",
  tagline: "indigo // gold leaf // constellations",
  swatch: "linear-gradient(120deg, #f5d76e 0%, #4a4e8f 55%, #12142e 100%)",
  tokens: {
    "--ato-bg": "#0d0f1e",
    "--ato-panel": "#141730ee",
    "--ato-panel-2": "#1b1f3ce8",
    "--ato-text": "#eceaf6",
    "--ato-text-dim": "#9a97b8",
    "--ato-accent": "#f5d76e",
    "--ato-accent-2": "#8ea7ff",
    "--ato-gold": "#f5d76e",
    "--ato-border": "#f5d76e26",
    "--ato-danger": "#e06a6a",
    "--ato-font-display": "'Cormorant Garamond', 'Zen Kaku Gothic New', serif",
    "--ato-font-body": "'Zen Kaku Gothic New', sans-serif",
    "--ato-font-mono": "'JetBrains Mono', monospace",
    "--ato-radius": "4px",
  },
  motion: {
    fast: 0.26,
    base: 0.5,
    slow: 0.95,
    easeOut: "cubic-bezier(0.19, 1, 0.22, 1)",
    easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    easeSlash: "cubic-bezier(0.7, 0, 0.2, 1)",
    spring: { stiffness: 220, damping: 28 },
    shake: 0.25,
  },
  shader: {
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime * 0.03;
  // night gradient with slow nebula wisps
  vec3 col = mix(uC * 1.6, uC * 0.8, smoothstep(-0.6, 0.9, p.y));
  float neb = fbm(p * 1.6 + vec2(t * 2.0, -t * 1.2));
  col += mix(uB, uA * 0.35, neb) * neb * 0.16 * (0.6 + uMid * 0.8);

  if (uQuality > 0.5) {
    // layered twinkling starfield
    for (int layer = 0; layer < 3; layer++) {
      float fl = float(layer) + 1.0;
      vec2 sp = p * (2.2 + fl * 1.9) + vec2(t * 10.0 * fl, 0.0);
      vec2 cell = floor(sp);
      vec2 f = fract(sp) - 0.5;
      float rnd = hash(cell + fl * 17.0);
      float star = step(0.965 - fl * 0.004, rnd);
      float tw = 0.55 + 0.45 * sin(uTime * (1.4 + rnd * 2.2) + rnd * 40.0);
      float d = length(f - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6);
      col += star * tw * smoothstep(0.16, 0.0, d) * mix(vec3(1.0), uA, rnd * 0.5) * (0.5 / fl);
    }
  }
  // gold moon-glow responding to bass, kept dignified
  col += glow(p, vec2(0.55, 0.42), 0.34 + uBass * 0.22, uA) * 0.5;
  return col;
}`,
    grain: 0.045,
    scanlines: 0.0,
    vignette: 0.5,
  },
  particles: { kind: "stars" },
  fonts: { display: "Cormorant Garamond", body: "Zen Kaku Gothic New", mono: "JetBrains Mono" },
};
