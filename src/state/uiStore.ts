import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SKIN_ID } from "@/skins/registry";
import type { FxQuality } from "@/skins/types";
import type { AuthUser } from "@/core/auth/authStore";

/** A saved server connection — "where my library lives" (own R2 deploy, a friend's worker, …) */
export interface SavedServer {
  id: string;
  name: string;
  url: string;
  mode: "legacy" | "account";
  /** legacy shared token */
  token?: string;
  /** account session snapshot — switching restores it directly */
  sessionToken?: string;
  user?: AuthUser;
  email?: string;
}

export type ViewId = "home" | "library" | "cloud" | "settings" | "album";
export type AlbumSource = "local" | "cloud";
export type RunnerKind = "off" | "cat" | "girl";

const BOOT_FLAG = "atori:booted";

/** full boot animation plays once per browser session */
export function markBooted() {
  try {
    sessionStorage.setItem(BOOT_FLAG, "1");
  } catch {
    // storage unavailable (private mode etc.) — boot just replays
  }
}

function sessionBooted() {
  try {
    return sessionStorage.getItem(BOOT_FLAG) === "1";
  } catch {
    return false;
  }
}

interface UiState {
  booted: boolean;
  view: ViewId;
  albumKey: string | null;
  albumSource: AlbumSource;
  nowPlayingOpen: boolean;
  paletteOpen: boolean;
  queueOpen: boolean;
  shortcutsOpen: boolean;
  /** track being edited in the metadata panel (null = closed) */
  editTrackId: number | null;
  wrappedOpen: boolean;
  /** epoch ms the sleep timer fires at (null = off) */
  sleepEndsAt: number | null;
  /** karaoke lyric offset in ms — positive pushes lines later */
  lrcOffset: number;
  /** name shown in the home greeting — empty = generic greeting */
  displayName: string;
  /** Now Playing layout: null = follow the skin's flatPlayer hint */
  npFlat: boolean | null;
  skinId: string;
  bgStyle: string;
  runner: RunnerKind;
  fxQuality: FxQuality;
  calm: boolean;
  fade: boolean;
  crossfadeSeconds: number;
  autoplay: boolean;
  smartVolume: boolean;
  eqEnabled: boolean;
  eq: number[];
  cloudUrl: string;
  cloudToken: string;
  /** saved server connections — pick one to switch where your library lives */
  savedServers: SavedServer[];
  activeServerId: string | null;
  setSavedServers: (list: SavedServer[]) => void;
  setActiveServerId: (id: string | null) => void;
  setCloud: (url: string, token: string) => void;
  setBooted: (b: boolean) => void;
  navigate: (view: ViewId, albumKey?: string, albumSource?: AlbumSource) => void;
  setNowPlayingOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setQueueOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setEditTrackId: (id: number | null) => void;
  setWrappedOpen: (open: boolean) => void;
  setSleepEndsAt: (t: number | null) => void;
  setLrcOffset: (ms: number) => void;
  setDisplayName: (name: string) => void;
  setNpFlat: (flat: boolean | null) => void;
  setSkin: (id: string) => void;
  setBgStyle: (id: string) => void;
  setRunner: (r: RunnerKind) => void;
  setFxQuality: (q: FxQuality) => void;
  setCalm: (c: boolean) => void;
  setFade: (on: boolean) => void;
  setCrossfadeSeconds: (s: number) => void;
  setAutoplay: (on: boolean) => void;
  setSmartVolume: (on: boolean) => void;
  setEq: (bands: number[]) => void;
  setEqEnabled: (on: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      booted: sessionBooted(),
      view: "home",
      albumKey: null,
      albumSource: "local",
      nowPlayingOpen: false,
      paletteOpen: false,
      queueOpen: false,
      shortcutsOpen: false,
      editTrackId: null,
      wrappedOpen: false,
      sleepEndsAt: null,
      lrcOffset: 0,
      displayName: "",
      npFlat: null,
      skinId: DEFAULT_SKIN_ID,
      bgStyle: "skin",
      runner: "off",
      fxQuality: "high",
      calm: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      fade: true,
      crossfadeSeconds: 1.2,
      autoplay: true,
      smartVolume: false,
      eqEnabled: false,
      eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      cloudUrl: "",
      cloudToken: "",
      savedServers: [],
      activeServerId: null,
      setCloud: (cloudUrl, cloudToken) => set({ cloudUrl, cloudToken }),
      setSavedServers: (savedServers) => set({ savedServers }),
      setActiveServerId: (activeServerId) => set({ activeServerId }),
      setBooted: (booted) => set({ booted }),
      navigate: (view, albumKey, albumSource) =>
        set({ view, albumKey: albumKey ?? null, albumSource: albumSource ?? "local" }),
      setNowPlayingOpen: (nowPlayingOpen) => set({ nowPlayingOpen }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setQueueOpen: (queueOpen) => set({ queueOpen }),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      setEditTrackId: (editTrackId) => set({ editTrackId }),
      setWrappedOpen: (wrappedOpen) => set({ wrappedOpen }),
      setSleepEndsAt: (sleepEndsAt) => set({ sleepEndsAt }),
      setLrcOffset: (lrcOffset) => set({ lrcOffset }),
      setDisplayName: (displayName) => set({ displayName: displayName.trim().slice(0, 24) }),
      setNpFlat: (npFlat) => set({ npFlat }),
      setSkin: (skinId) => set({ skinId }),
      setBgStyle: (bgStyle) => set({ bgStyle }),
      setRunner: (runner) => set({ runner }),
      setFxQuality: (fxQuality) => set({ fxQuality }),
      setCalm: (calm) => set({ calm }),
      setFade: (fade) => set({ fade }),
      setCrossfadeSeconds: (crossfadeSeconds) => set({ crossfadeSeconds: Math.max(0, Math.min(12, crossfadeSeconds)) }),
      setAutoplay: (autoplay) => set({ autoplay }),
      setSmartVolume: (smartVolume) => set({ smartVolume }),
      setEq: (eq) => set({ eq: [...eq] }),
      setEqEnabled: (eqEnabled) => set({ eqEnabled }),
    }),
    {
      name: "atori-ui",
      partialize: (s) => ({
        skinId: s.skinId,
        bgStyle: s.bgStyle,
        runner: s.runner,
        fxQuality: s.fxQuality,
        calm: s.calm,
        fade: s.fade,
        crossfadeSeconds: s.crossfadeSeconds,
        autoplay: s.autoplay,
        smartVolume: s.smartVolume,
        eqEnabled: s.eqEnabled,
        eq: s.eq,
        lrcOffset: s.lrcOffset,
        displayName: s.displayName,
        npFlat: s.npFlat,
        cloudUrl: s.cloudUrl,
        cloudToken: s.cloudToken,
        savedServers: s.savedServers,
        activeServerId: s.activeServerId,
      }),
    },
  ),
);
