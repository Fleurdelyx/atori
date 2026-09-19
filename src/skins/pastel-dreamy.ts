import type { SkinDef } from "./types";

/**
 * PASTEL DREAMY OVA — 90s city-pop mood.
 * Cream base, peach/lavender/mint, drifting bokeh, film grain,
 * slow dreamy motion.
 */
export const pastelDreamy: SkinDef = {
  id: "pastel-dreamy",
  name: "PASTEL DREAMY",
  nameJp: "ゆめかわオーバー",
  tagline: "city-pop // grain // bokeh",
  swatch: "linear-gradient(120deg, #ffb7c5 0%, #c9b1ff 50%, #a8e6cf 100%)",
  tokens: {
    "--ato-bg": "#faf1ec",
    "--ato-panel": "#ffffffd9",
    "--ato-panel-2": "#fff7f2e0",
    "--ato-text": "#4f3d5c",
    "--ato-text-dim": "#a08fb0",
    "--ato-accent": "#ff8fab",
    "--ato-accent-2": "#9b8cff",
    "--ato-gold": "#e8b04b",
    "--ato-border": "#4f3d5c1f",
    "--ato-danger": "#e05b5b",
    "--ato-font-display": "'M PLUS Rounded 1c', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-body": "'M PLUS Rounded 1c', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-mono": "'JetBrains Mono', monospace",
    "--ato-radius": "14px",
  },
  motion: {
    fast: 0.3,
    base: 0.55,
    slow: 1.1,
    easeOut: "cubic-bezier(0.22, 1, 0.36, 1)",
    easeInOut: "cubic-bezier(0.45, 0, 0.55, 1)",
    easeSlash: "cubic-bezier(0.33, 1, 0.68, 1)",
    spring: { stiffness: 170, damping: 26 },
    shake: 0.12,
  },
  shader: {
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime * 0.05;
  // sunset sky wash: peach -> lavender -> mint
  vec3 peach  = vec3(1.00, 0.82, 0.78);
  vec3 lav    = vec3(0.82, 0.78, 0.98);
  vec3 mint   = vec3(0.78, 0.94, 0.88);
  float band = p.y * 0.5 + 0.5 + 0.08 * sin(p.x * 2.0 + t * 6.0);
  vec3 col = mix(peach, lav, smoothstep(0.15, 0.65, band));
  col = mix(col, mint, smoothstep(0.6, 1.0, band));

  // drifting bokeh circles, gentle audio breathing
  if (uQuality > 0.5) {
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      vec2 c = vec2(
        sin(t * 8.0 + fi * 2.4) * 0.55 + cos(fi * 1.7) * 0.2,
        cos(t * 6.0 + fi * 1.9) * 0.38 + sin(fi * 2.3) * 0.12
      );
      float r = 0.10 + 0.05 * sin(fi * 3.1) + uLevel * 0.05;
      float d = length(p - c);
      float ring = smoothstep(r, r - 0.012, d) - smoothstep(r - 0.05, r - 0.062, d);
      float disc = smoothstep(r, r - 0.05, d) * 0.16;
      vec3 tint = mix(uA, uB, fract(fi * 0.37));
      col = mix(col, tint, clamp(disc + ring * 0.28, 0.0, 1.0));
    }
  }
  // soft light bloom on treble
  col += glow(p, vec2(0.0, -0.55), 0.5 + uTreble * 0.4, vec3(1.0, 0.95, 0.85)) * 0.25;
  return col;
}`,
    grain: 0.09,
    scanlines: 0.0,
    vignette: 0.22,
  },
  particles: { kind: "bokeh" },
  fonts: { display: "M PLUS Rounded 1c", body: "M PLUS Rounded 1c", mono: "JetBrains Mono" },
};
