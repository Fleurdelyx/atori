import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { getSkin } from "./registry";
import type { MotionProfile, SkinDef } from "./types";
import { useUi } from "@/state/uiStore";

interface SkinState {
  skin: SkinDef;
}

/** Active skin as zustand state so non-DOM consumers (shaders) can read it. */
export const useSkinStore = create<SkinState>()(() => ({
  skin: getSkin(useUi.getState().skinId),
}));

let initialized = false;

export function SkinProvider({ children }: { children: React.ReactNode }) {
  const skinId = useUi((s) => s.skinId);
  const accentOverride = useUi((s) => s.accentOverride);
  // the override rides INSIDE the skin object (not just the CSS var): every
  // consumer of useSkin(), the shader stage included, then follows the theme
  // color the moment it changes instead of drifting on the skin's default
  const skin = useMemo(() => {
    const base = getSkin(skinId);
    if (!accentOverride) return base;
    return { ...base, tokens: { ...base.tokens, "--ato-accent": accentOverride } };
  }, [skinId, accentOverride]);

  useEffect(() => {
    // Push token custom-properties onto :root; Tailwind utilities reference them.
    const root = document.documentElement;
    for (const [k, v] of Object.entries(skin.tokens)) root.style.setProperty(k, v);
    // data-skin lets CSS gate skin-specific shapes (e.g. persona textboxes)
    root.dataset.skin = skin.id;
    // keep the browser chrome tint in sync with the skin's background
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", skin.tokens["--ato-bg"] ?? "#0b0b12");
    useSkinStore.setState({ skin });
    initialized = true;
  }, [skin]);

  return <>{children}</>;
}

export function useSkin(): SkinDef {
  return useSkinStore((s) => s.skin);
}

export function useMotion(): MotionProfile {
  return useSkinStore((s) => s.skin.motion);
}

const easeCache = new Map<string, [number, number, number, number]>();

/** Motion's `ease` wants numeric beziers: parse a profile's CSS
 *  cubic-bezier() string once (falls back to the app-wide expo-out). */
export function cssEase(s: string): [number, number, number, number] {
  let v = easeCache.get(s);
  if (!v) {
    const m = s.match(/([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    v = m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : [0.16, 1, 0.3, 1];
    easeCache.set(s, v);
  }
  return v;
}

/** Imperative access for non-React modules. */
export function currentSkin(): SkinDef {
  if (!initialized) return getSkin(useUi.getState().skinId);
  return useSkinStore.getState().skin;
}
