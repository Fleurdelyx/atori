import type { SkinDef } from "./types";

/**
 * SOFT POP family — flat full-bleed color, centered art, gentle motion.
 * Inspired by those anime-album mobile players: one solid color carries the
 * whole screen, white type floats on it, nothing glows, nothing slashes.
 * Four colorways: magenta (hero), crimson, warm gray, lavender.
 * All default the Now Playing screen to the flat centered layout.
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

const flatShader = {
  body: /* glsl */ `
vec3 BG(vec2 p) {
  // the whole point: one honest, perfectly flat color
  return uC;
}`,
  grain: 0.0,
  scanlines: 0.0,
  vignette: 0.0,
};

const fonts = { display: "M PLUS Rounded 1c", body: "M PLUS Rounded 1c", mono: "JetBrains Mono" };

export const softPop: SkinDef = {
  id: "soft-pop",
  name: "SOFT POP",
  nameJp: "ソフトポップ",
  tagline: "flat magenta // centered art // round play",
  swatch: "linear-gradient(120deg, #e0447f 0%, #d63f7c 55%, #b83168 100%)",
  tokens: {
    "--ato-bg": "#d63f7c",
    "--ato-panel": "#ffffff2e",
    "--ato-panel-2": "#ffffff45",
    "--ato-text": "#ffffff",
    "--ato-text-dim": "#ffdcebb3",
    "--ato-accent": "#ffffff",
    "--ato-accent-2": "#5c1533",
    "--ato-gold": "#ffd76e",
    "--ato-border": "#ffffff42",
    "--ato-danger": "#7a1030",
    "--ato-font-display": "'M PLUS Rounded 1c', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-body": "'M PLUS Rounded 1c', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-mono": "'JetBrains Mono', monospace",
    "--ato-radius": "12px",
  },
  motion: softMotion,
  shader: flatShader,
  particles: { kind: "bokeh" },
  fonts,
  flatPlayer: true,
};

export const softPopRed: SkinDef = {
  id: "soft-pop-red",
  name: "SOFT POP RED",
  nameJp: "ソフトポップ・レッド",
  tagline: "flat crimson // centered art // round play",
  swatch: "linear-gradient(120deg, #cf4436 0%, #c13a2e 55%, #9e2d23 100%)",
  tokens: {
    "--ato-bg": "#c13a2e",
    "--ato-panel": "#ffffff2b",
    "--ato-panel-2": "#ffffff42",
    "--ato-text": "#ffffff",
    "--ato-text-dim": "#ffe4dcb3",
    "--ato-accent": "#ffffff",
    "--ato-accent-2": "#5e0f08",
    "--ato-gold": "#ffd76e",
    "--ato-border": "#ffffff42",
    "--ato-danger": "#3d0d08",
    "--ato-font-display": "'M PLUS Rounded 1c', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-body": "'M PLUS Rounded 1c', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-mono": "'JetBrains Mono', monospace",
    "--ato-radius": "12px",
  },
  motion: softMotion,
  shader: flatShader,
  particles: { kind: "bokeh" },
  fonts,
  flatPlayer: true,
};

export const softPopGray: SkinDef = {
  id: "soft-pop-gray",
  name: "SOFT POP GRAY",
  nameJp: "ソフトポップ・グレー",
  tagline: "flat warm gray // centered art // round play",
  swatch: "linear-gradient(120deg, #d9d6cd 0%, #eceae4 55%, #ffffff 100%)",
  tokens: {
    "--ato-bg": "#eceae4",
    "--ato-panel": "#ffffffc4",
    "--ato-panel-2": "#f6f5f0d9",
    "--ato-text": "#3a3a40",
    "--ato-text-dim": "#807e86",
    "--ato-accent": "#8f1d24",
    "--ato-accent-2": "#4f7d8a",
    "--ato-gold": "#b8860b",
    "--ato-border": "#3a3a4026",
    "--ato-danger": "#b3261e",
    "--ato-font-display": "'M PLUS Rounded 1c', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-body": "'M PLUS Rounded 1c', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-mono": "'JetBrains Mono', monospace",
    "--ato-radius": "12px",
  },
  motion: softMotion,
  shader: flatShader,
  particles: { kind: "bokeh" },
  fonts,
  flatPlayer: true,
};

export const softPopLavender: SkinDef = {
  id: "soft-pop-lavender",
  name: "SOFT POP LAVENDER",
  nameJp: "ソフトポップ・ラベンダー",
  tagline: "flat lavender // centered art // round play",
  swatch: "linear-gradient(120deg, #b9aede 0%, #ddd8ee 55%, #f3f1fa 100%)",
  tokens: {
    "--ato-bg": "#ddd8ee",
    "--ato-panel": "#ffffffc9",
    "--ato-panel-2": "#eae6f6d9",
    "--ato-text": "#2f2b45",
    "--ato-text-dim": "#77719a",
    "--ato-accent": "#6f46c2",
    "--ato-accent-2": "#3f7d8c",
    "--ato-gold": "#a8720a",
    "--ato-border": "#2f2b4526",
    "--ato-danger": "#b3261e",
    "--ato-font-display": "'M PLUS Rounded 1c', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-body": "'M PLUS Rounded 1c', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-mono": "'JetBrains Mono', monospace",
    "--ato-radius": "12px",
  },
  motion: softMotion,
  shader: flatShader,
  particles: { kind: "bokeh" },
  fonts,
  flatPlayer: true,
};
