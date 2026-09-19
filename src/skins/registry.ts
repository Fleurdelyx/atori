import { neonGacha } from "./neon-gacha";
import { pastelDreamy } from "./pastel-dreamy";
import { celestialDark } from "./celestial-dark";
import { persona5 } from "./persona-5";
import { godEater } from "./god-eater";
import { minimal } from "./minimal";
import { minimalLight } from "./minimal-light";
import { softPop, softPopRed, softPopGray, softPopLavender } from "./soft-pop";
import type { FxQuality, SkinDef } from "./types";

export type { FxQuality, Grade, SkinDef } from "./types";

export const SKINS: SkinDef[] = [
  neonGacha,
  pastelDreamy,
  celestialDark,
  persona5,
  godEater,
  minimal,
  minimalLight,
  softPop,
  softPopRed,
  softPopGray,
  softPopLavender,
];

export const DEFAULT_SKIN_ID = neonGacha.id;

/** Status line shown under the EQ in Settings. */
export const EQ_APPLIED_LABEL = "BIQUAD CHAIN 32Hz→16kHz // TAPPED PRE-ANALYSER";

export function getSkin(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? neonGacha;
}

/** DPR cap per FX quality tier. */
export function qualityDprCap(q: FxQuality): number {
  switch (q) {
    case "ultra":
      return 2;
    case "high":
      return 1.5;
    case "medium":
      return 1;
    case "low":
      return 0.66;
  }
}

/** Uniform scalar fed to shaders — lets skins drop expensive branches. */
export function qualityScalar(q: FxQuality): number {
  switch (q) {
    case "ultra":
      return 1;
    case "high":
      return 0.85;
    case "medium":
      return 0.6;
    case "low":
      return 0.4;
  }
}
