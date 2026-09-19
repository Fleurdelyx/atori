import type { SkinDef } from "./types";

/**
 * MINIMAL — calm Spotify-dark mode for work.
 * Near-flat #121212 base, green accent, rounded corners, no grain,
 * barely-there ambient haze. The quiet one.
 */
export const minimal: SkinDef = {
  id: "minimal",
  name: "MINIMAL",
  nameJp: "ミニマル",
  tagline: "quiet dark // green // work mode",
  swatch: "linear-gradient(120deg, #1ed760 0%, #191919 55%, #121212 100%)",
  tokens: {
    "--ato-bg": "#121212",
    "--ato-panel": "#181818f2",
    "--ato-panel-2": "#242424ee",
    "--ato-text": "#ffffff",
    "--ato-text-dim": "#b3b3b3",
    "--ato-accent": "#1ed760",
    "--ato-accent-2": "#509bf5",
    "--ato-gold": "#ffb443",
    "--ato-border": "#ffffff1a",
    "--ato-danger": "#f15e6c",
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
  // near-flat dark wash, barely lit toward the top like a desktop app
  vec3 col = mix(uC * 1.3, uC * 0.78, smoothstep(-0.8, 0.9, p.y));
  // huge ultra-soft accent haze drifting along the top edge; audio only
  // breathes its brightness (amplitude-only, frozen by calm mode)
  col += glow(p, vec2(sin(t * 5.0) * 0.55, 0.55), 1.1, uA) * (0.045 + 0.05 * uLevel * react);
  // faint second tint low in the frame so black never reads dead-flat
  col += glow(p, vec2(cos(t * 3.0) * 0.5, -0.55), 1.2, uB) * 0.025;
  return col;
}`,
    grain: 0.0,
    scanlines: 0.0,
    vignette: 0.25,
  },
  particles: { kind: "bokeh" },
  fonts: { display: "Figtree", body: "Figtree", mono: "JetBrains Mono" },
};
