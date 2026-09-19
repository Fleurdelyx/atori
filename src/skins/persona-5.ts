import type { SkinDef } from "./types";

/**
 * PERSONA — Persona 5-inspired theme.
 * Take-your-heart red on black, jagged white textboxes with black outlines,
 * halftone print texture, heavy condensed type, aggressive slash motion.
 */
export const persona5: SkinDef = {
  id: "persona-5",
  name: "PERSONA",
  nameJp: "ペルソナ",
  tagline: "black // heart-red // jagged white",
  swatch: "linear-gradient(120deg, #e60012 0%, #0a0a0c 55%, #ffffff 100%)",
  tokens: {
    "--ato-bg": "#0a0a0c",
    "--ato-panel": "#fffffff7",
    "--ato-panel-2": "#f4f4f2f2",
    "--ato-text": "#f5f2ee",
    "--ato-text-dim": "#b8b3ad",
    "--ato-accent": "#e60012",
    "--ato-accent-2": "#ffffff",
    "--ato-gold": "#ffffff",
    "--ato-border": "#101014",
    "--ato-danger": "#b30010",
    "--ato-font-display": "'Anton', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-body": "'Zen Kaku Gothic New', sans-serif",
    "--ato-font-mono": "'JetBrains Mono', monospace",
    "--ato-radius": "0px",
  },
  motion: {
    fast: 0.15,
    base: 0.28,
    slow: 0.6,
    easeOut: "cubic-bezier(0.2, 1, 0.3, 1)",
    easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    easeSlash: "cubic-bezier(0.85, 0, 0.1, 1)",
    spring: { stiffness: 600, damping: 32 },
    shake: 1.2,
  },
  shader: {
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime * 0.35;
  float react = 1.0 - uCalm;
  vec3 col = mix(uC * 1.35, uC * 0.55, smoothstep(-0.7, 0.9, p.y));

  // rotate into the brand-slash frame
  float ca = cos(-0.42);
  float sa = sin(-0.42);
  vec2 rp = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);

  // main red slash, drifting and breathing with the bass
  float w = 0.09 + uBass * 0.14 * react;
  float c1 = 0.5 + sin(t * 0.8) * 0.38;
  float s1 = exp(-pow((rp.x - c1) / w, 2.0));
  // second thinner slash on the opposite side
  float s2 = exp(-pow((rp.x + 0.62 + sin(t * 0.6 + 1.3) * 0.18) / 0.05, 2.0)) * 0.75;
  // hairline white edge riding the main slash
  float edge = exp(-pow((rp.x - c1 - w * 1.25) * 110.0, 2.0));

  vec3 red = mix(uA, vec3(1.0), 0.10);
  col += red * (s1 * (0.5 + uLevel * 0.4) + s2 * 0.5) * react;
  col += vec3(1.0) * edge * 0.45 * react;

  // halftone print patches (white top-right, red bottom-left)
  vec2 hp = rp * 13.0 + vec2(t * 0.4, -t * 0.25);
  vec2 cell = floor(hp);
  vec2 hf = fract(hp) - 0.5;
  float r1 = 0.10 + 0.30 * hash(cell) * (0.35 + uTreble * 1.3) * react;
  float ht1 = smoothstep(r1, r1 - 0.09, length(hf)) * step(0.55, hash(cell + 4.0));
  float patch1 = smoothstep(1.4, 0.5, length(p - vec2(0.85, 0.55)));
  col += vec3(1.0) * ht1 * patch1 * 0.20;
  float r2 = 0.12 + 0.32 * hash(cell + 9.0) * (0.35 + uMid * 1.1) * react;
  float ht2 = smoothstep(r2, r2 - 0.09, length(hf)) * step(0.62, hash(cell + 11.0));
  float patch2 = smoothstep(1.25, 0.45, length(p - vec2(-0.95, -0.5)));
  col += uA * ht2 * patch2 * 0.26;

  // faint white sliver drifting far background
  float sliver = exp(-pow((rp.y + 0.35 + sin(t * 0.5) * 0.12) * 55.0, 2.0));
  col += vec3(1.0) * sliver * 0.05;

  // impact: jagged white slash flash (brief, bounded)
  if (uImpact > 0.01) {
    float jag = sin(rp.y * 42.0 + uTime * 9.0) * 0.02;
    float flash = exp(-pow((rp.x - (0.4 - uImpact * 1.1) + jag) * 20.0, 2.0));
    col += vec3(1.0) * flash * uImpact * 0.85 * react;
  }
  return col;
}`,
    grain: 0.06,
    scanlines: 0.04,
    vignette: 0.45,
  },
  particles: { kind: "shards" },
  fonts: { display: "Anton", body: "Zen Kaku Gothic New", mono: "JetBrains Mono" },
};
