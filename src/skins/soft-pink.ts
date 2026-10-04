import type { SkinDef } from "./types";

/**
 * SOFT PINK: the SOFT POP family's dark mode — deep plum-charcoal field,
 * soft rose accents, rounded corners, gentle motion. Flat-shader calm with
 * a faint drifting aura; nothing glows hard, nothing slashes.
 */

const softMotion = {
  fast: 0.2,
  base: 0.38,
  slow: 0.7,
  easeOut: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  easeSlash: "cubic-bezier(0.33, 1, 0.68, 1)",
  spring: { stiffness: 210, damping: 28 },
  shake: 0,
};

const auraShader = {
  body: /* glsl */ `
vec3 BG(vec2 p) {
  // dark plum field with a barely-there rose aura drifting through it
  vec3 col = mix(uC * 1.45, uC * 0.8, smoothstep(-0.7, 0.9, p.y));
  float aura = fbm(p * 1.1 + vec2(uTime * 0.02, -uTime * 0.013));
  col += uA * aura * 0.07 * (0.5 + uMid * 0.7);
  return col;
}`,
  grain: 0.02,
  scanlines: 0.0,
  vignette: 0.22,
};

const fonts = { display: "M PLUS Rounded 1c", body: "M PLUS Rounded 1c", mono: "JetBrains Mono" };

export const softPinkDark: SkinDef = {
  id: "soft-pink",
  name: "SOFT PINK",
  nameJp: "ソフトピンク",
  tagline: "dark plum // soft rose // gentle motion",
  swatch: "linear-gradient(120deg, #191218 0%, #3a2431 55%, #f7a8c4 100%)",
  tokens: {
    "--ato-bg": "#191218",
    "--ato-panel": "#ffffff12",
    "--ato-panel-2": "#ffffff1e",
    "--ato-text": "#f7edf3",
    "--ato-text-dim": "#c2a3b3",
    "--ato-accent": "#f7a8c4",
    "--ato-accent-2": "#c9a0e8",
    "--ato-gold": "#f5c98a",
    "--ato-border": "#ffffff22",
    "--ato-danger": "#e05a7a",
    "--ato-font-display": "'M PLUS Rounded 1c', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-body": "'M PLUS Rounded 1c', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-mono": "'JetBrains Mono', monospace",
    "--ato-radius": "12px",
  },
  motion: softMotion,
  shader: auraShader,
  particles: { kind: "bokeh" },
  fonts,
  flatPlayer: true,
};
