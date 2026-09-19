import type { SkinDef } from "./types";

/**
 * MINIMAL LIGHT — the quiet one with the lights on.
 * Same Spotify-like calm as MINIMAL, tuned for bright rooms:
 * off-white base, darker green so text keeps contrast, near-flat shader.
 */
export const minimalLight: SkinDef = {
  id: "minimal-light",
  name: "MINIMAL LIGHT",
  nameJp: "ミニマル・ライト",
  tagline: "quiet light // green // work mode",
  swatch: "linear-gradient(120deg, #0f8f47 0%, #f0f0f3 55%, #ffffff 100%)",
  tokens: {
    "--ato-bg": "#efeff2",
    "--ato-panel": "#fffffff0",
    "--ato-panel-2": "#f7f7faf0",
    "--ato-text": "#1a1a20",
    "--ato-text-dim": "#6a6a76",
    "--ato-accent": "#0f8f47",
    "--ato-accent-2": "#3d6fe0",
    "--ato-gold": "#a8720a",
    "--ato-border": "#1a1a201f",
    "--ato-danger": "#d64545",
    "--ato-font-display": "'Figtree', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-body": "'Figtree', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-mono": "'JetBrains Mono', monospace",
    "--ato-radius": "8px",
  },
  motion: {
    fast: 0.16,
    base: 0.3,
    slow: 0.6,
    easeOut: "cubic-bezier(0.22, 1, 0.36, 1)",
    easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    easeSlash: "cubic-bezier(0.33, 1, 0.68, 1)",
    spring: { stiffness: 240, damping: 30 },
    shake: 0,
  },
  shader: {
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime * 0.02;
  float react = 1.0 - uCalm;
  // near-flat light wash, a touch cooler toward the bottom
  vec3 col = mix(uC * 1.02, uC * 0.88, smoothstep(-0.8, 0.9, p.y));
  // huge ultra-soft green haze drifting along the top edge; audio only
  // breathes its brightness (amplitude-only, frozen by calm mode)
  col += glow(p, vec2(sin(t * 5.0) * 0.55, 0.55), 1.1, uA) * (0.05 + 0.05 * uLevel * react);
  // faint second tint low in the frame so the base never reads dead-flat
  col += glow(p, vec2(cos(t * 3.0) * 0.5, -0.55), 1.2, uB) * 0.03;
  return col;
}`,
    grain: 0.0,
    scanlines: 0.0,
    vignette: 0.15,
  },
  particles: { kind: "bokeh" },
  fonts: { display: "Figtree", body: "Figtree", mono: "JetBrains Mono" },
};
