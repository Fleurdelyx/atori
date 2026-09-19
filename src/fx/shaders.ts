import type { ShaderPack } from "@/skins/types";

/** Vertex shader — fullscreen clip-space quad. */
export const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Shared GLSL prelude: uniforms + helper functions available to skin bodies. */
const PRELUDE = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec2  uRes;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uLevel;
uniform float uImpact;
uniform float uWipe;
uniform vec3  uA;      // skin accent
uniform vec3  uB;      // skin accent 2
uniform vec3  uC;      // skin background
uniform float uGrain;
uniform float uScan;
uniform float uVig;
uniform float uQuality; // 1 ultra … 0.4 low
uniform float uCalm;
uniform sampler2D uBands; // 32x1 FFT band data (red channel), log-spaced

varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.55;
  }
  return v;
}

vec3 glow(vec2 p, vec2 c, float r, vec3 tint) {
  float d = length(p - c) / max(r, 1e-4);
  return tint * exp(-d * d * 3.0) * 0.55 + tint * exp(-d * 2.2) * 0.12;
}

float gridLine(float x, float w) {
  float d = min(fract(x), 1.0 - fract(x));
  return smoothstep(w, 0.0, d);
}
`;

/** Post-processing + main(), appended after the skin's BG(). */
const POSTLUDE = /* glsl */ `
void main() {
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) * 2.0;

  vec3 col = BG(p);

  // impact: chromatic fringe + accent flash
  if (uImpact > 0.01) {
    float fr = uImpact * 0.09 * smoothstep(0.15, 1.0, length(p));
    col.r += fr * 1.4;
    col.b += fr * 0.8;
    col += uA * uImpact * 0.05;
  }

  // wipe: diagonal streak sweeping across the screen
  if (uWipe > 0.01) {
    float x = vUv.x + vUv.y * 0.35;
    float lx = 1.35 - uWipe * 1.9;
    float line = exp(-pow((x - lx) * 16.0, 2.0));
    float body = exp(-pow((x - lx) * 4.0, 2.0)) * 0.22;
    col += (line + body) * mix(uA, uB, 0.5) * uWipe * 1.5;
  }

  // film grain, animated
  float g = hash(vUv * uRes + fract(uTime) * 137.0) - 0.5;
  col += g * uGrain * (0.4 + uLevel * 0.8);

  // scanlines
  col *= 1.0 - uScan * (0.5 + 0.5 * sin(vUv.y * uRes.y * 1.7));

  // vignette
  float v = smoothstep(1.95, 0.35, length(p));
  col = mix(col, col * v, uVig);

  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

/** Assemble the full fragment shader for a skin. */
export function buildFragment(pack: ShaderPack): string {
  return PRELUDE + pack.body + POSTLUDE;
}
