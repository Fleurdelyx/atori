import type { SkinDef } from "./types";

/**
 * NEON GACHA FUSION — the default skin.
 * Arknights-style charcoal UI, neon magenta/cyan, gold foil accents,
 * glitch kinetic type, perspective grid + speed-streak shader.
 */
export const neonGacha: SkinDef = {
  id: "neon-gacha",
  name: "NEON GACHA",
  nameJp: "ネオンガチャ",
  tagline: "charcoal // neon // foil",
  swatch: "linear-gradient(120deg, #ff2e88 0%, #7a2eff 45%, #00e5ff 100%)",
  tokens: {
    "--ato-bg": "#0b0b12",
    "--ato-panel": "#12121cee",
    "--ato-panel-2": "#1a1a28ee",
    "--ato-text": "#f2f2f8",
    "--ato-text-dim": "#8b8ba3",
    "--ato-accent": "#ff2e88",
    "--ato-accent-2": "#00e5ff",
    "--ato-gold": "#ffcf5c",
    "--ato-border": "#ffffff14",
    "--ato-danger": "#ff4d4d",
    "--ato-font-display": "'Chakra Petch', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-body": "'Chakra Petch', 'Zen Kaku Gothic New', sans-serif",
    "--ato-font-mono": "'JetBrains Mono', monospace",
    "--ato-radius": "2px",
  },
  motion: {
    fast: 0.18,
    base: 0.32,
    slow: 0.7,
    easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
    easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    easeSlash: "cubic-bezier(0.9, 0, 0.1, 1)",
    spring: { stiffness: 520, damping: 30 },
    shake: 1,
  },
  shader: {
    body: /* glsl */ `
vec3 BG(vec2 p) {
  float t = uTime * 0.22;
  // deep charcoal field with a faint diagonal wash
  float diag = smoothstep(1.1, -0.5, p.x * 0.6 + p.y);
  vec3 col = mix(uC * 1.25, uC * 0.72, diag);

  // audio-reactive neon blobs (bass -> magenta, mid -> cyan)
  float b1 = 0.55 + uBass * 0.9;
  float g1 = glow(p, vec2(sin(t) * 0.62, cos(t * 0.71) * 0.34), b1, uA);
  float g2 = glow(p, vec2(-sin(t * 0.83) * 0.66, sin(t * 0.52 + 1.7) * 0.38), 0.42 + uMid * 0.6, uB);
  col += g1 * 0.85 + g2 * 0.7;

  if (uQuality > 0.72) {
    // receding perspective grid, brightens with level
    vec2 gp = vec2(p.x, p.y + uTime * 0.09);
    float gx = gridLine(gp.x * 7.0, 0.030);
    float gy = gridLine(gp.y * 7.0, 0.030);
    float fade = smoothstep(1.25, 0.15, length(p));
    col += (gx + gy) * mix(uB, uA, 0.5 + 0.5 * sin(t)) * (0.10 + uLevel * 0.5) * fade;
  }

  // impact speed-streaks bursting from center
  if (uImpact > 0.01) {
    float ang = atan(p.y, p.x);
    float streak = pow(abs(sin(ang * 18.0 + uTime * 3.0)), 24.0);
    col += streak * uImpact * mix(uA, uB, 0.5) * 0.9 * smoothstep(0.2, 0.9, length(p));
  }
  return col;
}`,
    grain: 0.05,
    scanlines: 0.05,
    vignette: 0.42,
  },
  particles: { kind: "shards" },
  fonts: { display: "Chakra Petch", body: "Chakra Petch", mono: "JetBrains Mono" },
};
