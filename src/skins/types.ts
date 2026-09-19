/**
 * ATRI skin engine — a skin is data, not code paths.
 * Every skin supplies tokens (CSS custom properties), a motion profile,
 * a shader pack (GLSL body for the background stage), particle flavor,
 * post-fx recipe and font stacks. UI components only ever read tokens.
 */

export type FxQuality = "ultra" | "high" | "medium" | "low";

export type Grade = "SSR" | "SR" | "R" | "N";

export interface MotionProfile {
  /** micro interaction (hover, press) — seconds */
  fast: number;
  /** standard screen element transition — seconds */
  base: number;
  /** set-piece moments (cut-ins, wipes) — seconds */
  slow: number;
  easeOut: string;
  easeInOut: string;
  /** snappy slash-ease used for wipes and cut-ins */
  easeSlash: string;
  spring: { stiffness: number; damping: number };
  /** screen-shake multiplier on impact moments (0 = none) */
  shake: number;
}

export interface ShaderPack {
  /** GLSL: must define `vec3 BG(vec2 p)` — scene background color field */
  body: string;
  grain: number;
  scanlines: number;
  vignette: number;
}

export interface ParticleConfig {
  kind: "shards" | "bokeh" | "stars";
}

export interface SkinDef {
  id: string;
  name: string;
  nameJp: string;
  tagline: string;
  /** CSS custom properties (full names, e.g. `--ato-bg`) applied on :root */
  tokens: Record<string, string>;
  motion: MotionProfile;
  shader: ShaderPack;
  particles: ParticleConfig;
  fonts: { display: string; body: string; mono: string };
  /** gradient used for skin-picker swatches */
  swatch: string;
  /** hint: Now Playing defaults to the centered flat-player layout */
  flatPlayer?: boolean;
}
