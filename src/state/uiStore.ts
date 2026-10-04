import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SKIN_ID } from "@/skins/registry";
import type { FxQuality } from "@/skins/types";
import type { AuthUser } from "@/core/auth/authStore";

/** A saved server connection: "where my library lives" (own R2 deploy, a friend's worker, …) */
export interface SavedServer {
  id: string;
  name: string;
  url: string;
  mode: "legacy" | "account";
  /** legacy shared token */
  token?: string;
  /** account session snapshot: switching restores it directly */
  sessionToken?: string;
  user?: AuthUser;
  email?: string;
}

export type ViewId = "home" | "library" | "cloud" | "catalogue" | "settings" | "album";
export type AlbumSource = "local" | "cloud" | "catalogue";
export type RunnerKind = "off" | "cat" | "girl";
/** queue presentation: classic slide-over list or the phonograph disc+rail view */
export type QueueStyle = "panel" | "phonograph";

const BOOT_FLAG = "atori:booted";

/** full boot animation plays once per browser session */
export function markBooted() {
  try {
    sessionStorage.setItem(BOOT_FLAG, "1");
  } catch {
    // storage unavailable (private mode etc.): boot just replays
  }
}

function sessionBooted() {
  try {
    return sessionStorage.getItem(BOOT_FLAG) === "1";
  } catch {
    return false;
  }
}

/** one back/forward history entry: a view plus its album context */
export interface ViewEntry {
  view: ViewId;
  albumKey: string | null;
  albumSource: AlbumSource;
}

/** Push a view onto the back/forward history. Returns the new stack, or null
 *  when the entry duplicates the current one (no history churn on re-clicks). */
function pushViewEntry(
  s: { viewHistory: ViewEntry[]; viewHistoryIndex: number },
  view: ViewId,
  albumKey: string | null,
  albumSource: AlbumSource,
): { hist: ViewEntry[]; index: number } | null {
  const entry: ViewEntry = { view, albumKey, albumSource };
  const cur = s.viewHistory[s.viewHistoryIndex];
  if (cur && cur.view === entry.view && cur.albumKey === entry.albumKey && cur.albumSource === entry.albumSource) {
    return null;
  }
  // a fresh navigation truncates the forward stack
  const hist = [...s.viewHistory.slice(0, s.viewHistoryIndex + 1), entry].slice(-50);
  return { hist, index: hist.length - 1 };
}

interface UiState {
  booted: boolean;
  view: ViewId;
  albumKey: string | null;
  albumSource: AlbumSource;
  /** back/forward navigation history (mouse side buttons, Alt+arrows) */
  viewHistory: ViewEntry[];
  viewHistoryIndex: number;
  /** the left rail collapsed to icon-only (Spotify-style) */
  railCollapsed: boolean;
  /** shared catalogue playable even signed out (disable = offline-only) */
  catalogueEnabled: boolean;
  nowPlayingOpen: boolean;
  /** YT-style floating mini player: NP minimized into a draggable bubble */
  miniBubble: boolean;
  paletteOpen: boolean;
  queueOpen: boolean;
  shortcutsOpen: boolean;
  /** track being edited in the metadata panel (null = closed) */
  editTrackId: number | null;
  /** album editor target: "album::albumArtist" key over the merged library */
  editAlbumKey: string | null;
  /** playlist creation dialog; seedTrackIds pre-fill it, onCreated fires after */
  playlistCreate: { seedTrackIds?: number[]; onCreated?: (id: number) => void } | null;
  /** playlist id awaiting the rename dialog (sidebar rail menu) */
  playlistRename: number | null;
  wrappedOpen: boolean;
  /** epoch ms the sleep timer fires at (null = off) */
  sleepEndsAt: number | null;
  /** karaoke lyric offset in ms: positive pushes lines later */
  lrcOffset: number;
  /** name shown in the home greeting: empty = generic greeting */
  displayName: string;
  /** Now Playing layout: null = follow the skin's flatPlayer hint */
  npFlat: boolean | null;
  /** queue layout: classic slide-over list or the phonograph disc+rail view */
  queueStyle: QueueStyle;
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
  /** saved server connections: pick one to switch where your library lives */
  savedServers: SavedServer[];
  activeServerId: string | null;
  /** OFFLINE mode: no servers, just saved/local music (cached cloud tracks still play) */
  offlineMode: boolean;
  /** the first-run connection chooser has been answered */
  cloudSetupDone: boolean;
  /** playlist ids pinned to the left rail, in pin order */
  pinnedPlaylists: number[];
  /** cross-component "open this playlist" signal (rail → library selection) */
  playlistFocus: { id: number; n: number } | null;
  setPlaylistFocus: (f: { id: number; n: number } | null) => void;
  /** cross-component "open Liked Songs" signal (rail → library pane) */
  likedFocus: number | null;
  openLiked: () => void;
  /** catalogue playlists saved into the user's library (Spotify-style:
   *  references by id, read-only, device-local) */
  savedCataloguePls: string[];
  toggleSavedCatalogue: (id: string) => void;
  savedCatalogueFocus: { id: string; n: number } | null;
  openSavedCatalogue: (id: string) => void;
  /** cross-component "open this cloud playlist" signal (Home search → playlists tab) */
  cloudPlaylistFocus: { id: string; n: number } | null;
  /** cross-component "open this artist" signal (Home search → artists tab) */
  artistFocus: { name: string; n: number } | null;
  /** Library screen's text filter, lifted so Home search can prefill it */
  libraryFilter: string;
  /** Fleurite-style theme studio overlay */
  themeStudioOpen: boolean;
  /** user-chosen accent color overriding the skin's: null = skin default */
  accentOverride: string | null;
  setThemeStudioOpen: (open: boolean) => void;
  setAccentOverride: (color: string | null) => void;
  setCloudPlaylistFocus: (f: { id: string; n: number } | null) => void;
  setArtistFocus: (f: { name: string; n: number } | null) => void;
  setLibraryFilter: (q: string) => void;
  setOfflineMode: (on: boolean) => void;
  setCloudSetupDone: (done: boolean) => void;
  togglePinnedPlaylist: (id: number) => void;
  openPlaylist: (id: number) => void;
  setPlaylistRename: (id: number | null) => void;
  setSavedServers: (list: SavedServer[]) => void;
  setActiveServerId: (id: string | null) => void;
  setCloud: (url: string, token: string) => void;
  setBooted: (b: boolean) => void;
  navigate: (view: ViewId, albumKey?: string, albumSource?: AlbumSource) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  /** jump the history to a web-history position (browser back/forward); never pushes */
  restoreHistoryIndex: (index: number) => void;
  setRailCollapsed: (collapsed: boolean) => void;
  setCatalogueEnabled: (on: boolean) => void;
  setNowPlayingOpen: (open: boolean) => void;
  setMiniBubble: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setQueueOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setEditTrackId: (id: number | null) => void;
  setEditAlbumKey: (key: string | null) => void;
  setPlaylistCreate: (v: { seedTrackIds?: number[]; onCreated?: (id: number) => void } | null) => void;
  setWrappedOpen: (open: boolean) => void;
  setSleepEndsAt: (t: number | null) => void;
  setLrcOffset: (ms: number) => void;
  setDisplayName: (name: string) => void;
  setNpFlat: (flat: boolean | null) => void;
  setQueueStyle: (style: QueueStyle) => void;
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
    (set, get) => ({
      booted: sessionBooted(),
      view: "home",
      albumKey: null,
      albumSource: "local",
      viewHistory: [{ view: "home", albumKey: null, albumSource: "local" }],
      viewHistoryIndex: 0,
      railCollapsed: false,
      catalogueEnabled: true,
      nowPlayingOpen: false,
      miniBubble: false,
      paletteOpen: false,
      queueOpen: false,
      shortcutsOpen: false,
      editTrackId: null,
      editAlbumKey: null,
      playlistCreate: null,
      playlistRename: null,
      wrappedOpen: false,
      sleepEndsAt: null,
      lrcOffset: 0,
      displayName: "",
      npFlat: null,
      queueStyle: "phonograph",
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
      offlineMode: false,
      cloudSetupDone: false,
      pinnedPlaylists: [],
      playlistFocus: null,
      cloudPlaylistFocus: null,
      artistFocus: null,
      libraryFilter: "",
      themeStudioOpen: false,
      accentOverride: null,
      setOfflineMode: (offlineMode) => set({ offlineMode }),
      setCloudSetupDone: (cloudSetupDone) => set({ cloudSetupDone }),
      togglePinnedPlaylist: (id) =>
        set((s) => ({
          pinnedPlaylists: s.pinnedPlaylists.includes(id)
            ? s.pinnedPlaylists.filter((p) => p !== id)
            : [...s.pinnedPlaylists, id],
        })),
      openPlaylist: (id) =>
        set((s) => {
          const push = pushViewEntry(s, "library", null, "local");
          return {
            playlistFocus: { id, n: Date.now() },
            likedFocus: null,
            savedCatalogueFocus: null,
            view: "library" as const,
            albumKey: null,
            albumSource: "local" as const,
            ...(push ? { viewHistory: push.hist, viewHistoryIndex: push.index } : {}),
          };
        }),
      setCloud: (cloudUrl, cloudToken) => set({ cloudUrl, cloudToken }),
      setSavedServers: (savedServers) => set({ savedServers }),
      setActiveServerId: (activeServerId) => set({ activeServerId }),
      setBooted: (booted) => set({ booted }),
      navigate: (view, albumKey, albumSource) =>
        set((s) => {
          const key = albumKey ?? null;
          const source = albumSource ?? "local";
          const push = pushViewEntry(s, view, key, source);
          return {
            view,
            albumKey: key,
            albumSource: source,
            ...(push ? { viewHistory: push.hist, viewHistoryIndex: push.index } : {}),
          };
        }),
      navigateBack: () => {
        // the web history IS the view history (one pushState per entry), so
        // back/forward route through it: the browser chrome, Alt+arrows and
        // mouse side buttons all drive the same stack, and popstate moves
        // the store via restoreHistoryIndex
        if (get().viewHistoryIndex <= 0) return;
        window.history.back();
      },
      navigateForward: () => {
        const s = get();
        if (s.viewHistoryIndex >= s.viewHistory.length - 1) return;
        window.history.forward();
      },
      restoreHistoryIndex: (index) =>
        set((s) => {
          if (index < 0 || index >= s.viewHistory.length || index === s.viewHistoryIndex) return {};
          const e = s.viewHistory[index];
          return { viewHistoryIndex: index, view: e.view, albumKey: e.albumKey, albumSource: e.albumSource };
        }),
      setRailCollapsed: (railCollapsed) => set({ railCollapsed }),
      setCatalogueEnabled: (catalogueEnabled) => set({ catalogueEnabled }),
      setNowPlayingOpen: (nowPlayingOpen) => set({ nowPlayingOpen }),
      setMiniBubble: (miniBubble) => set({ miniBubble }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setQueueOpen: (queueOpen) => set({ queueOpen }),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      setEditTrackId: (editTrackId) => set({ editTrackId }),
      setEditAlbumKey: (editAlbumKey) => set({ editAlbumKey }),
      setPlaylistCreate: (playlistCreate) => set({ playlistCreate }),
      setPlaylistRename: (playlistRename) => set({ playlistRename }),
      setThemeStudioOpen: (themeStudioOpen) => set({ themeStudioOpen }),
      setAccentOverride: (accentOverride) => set({ accentOverride }),
      setCloudPlaylistFocus: (cloudPlaylistFocus) => set({ cloudPlaylistFocus }),
      setPlaylistFocus: (playlistFocus) => set({ playlistFocus }),
      likedFocus: null,
      openLiked: () =>
        set((s) => {
          const push = pushViewEntry(s, "library", null, "local");
          return {
            likedFocus: Date.now(),
            playlistFocus: null,
            savedCatalogueFocus: null,
            view: "library" as const,
            albumKey: null,
            albumSource: "local" as const,
            ...(push ? { viewHistory: push.hist, viewHistoryIndex: push.index } : {}),
          };
        }),
      savedCataloguePls: [],
      toggleSavedCatalogue: (id) =>
        set((s) => ({
          savedCataloguePls: s.savedCataloguePls.includes(id)
            ? s.savedCataloguePls.filter((p) => p !== id)
            : [...s.savedCataloguePls, id],
        })),
      savedCatalogueFocus: null,
      openSavedCatalogue: (id) =>
        set((s) => {
          const push = pushViewEntry(s, "library", null, "local");
          return {
            savedCatalogueFocus: { id, n: Date.now() },
            likedFocus: null,
            playlistFocus: null,
            view: "library" as const,
            albumKey: null,
            albumSource: "local" as const,
            ...(push ? { viewHistory: push.hist, viewHistoryIndex: push.index } : {}),
          };
        }),
      setArtistFocus: (artistFocus) => set({ artistFocus }),
      setLibraryFilter: (libraryFilter) => set({ libraryFilter }),
      setWrappedOpen: (wrappedOpen) => set({ wrappedOpen }),
      setSleepEndsAt: (sleepEndsAt) => set({ sleepEndsAt }),
      setLrcOffset: (lrcOffset) => set({ lrcOffset }),
      setDisplayName: (displayName) => set({ displayName: displayName.trim().slice(0, 24) }),
      setNpFlat: (npFlat) => set({ npFlat }),
      setQueueStyle: (queueStyle) => set({ queueStyle }),
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
        queueStyle: s.queueStyle,
        cloudUrl: s.cloudUrl,
        cloudToken: s.cloudToken,
        savedServers: s.savedServers,
        activeServerId: s.activeServerId,
        offlineMode: s.offlineMode,
        cloudSetupDone: s.cloudSetupDone,
        pinnedPlaylists: s.pinnedPlaylists,
        accentOverride: s.accentOverride,
        railCollapsed: s.railCollapsed,
        catalogueEnabled: s.catalogueEnabled,
        savedCataloguePls: s.savedCataloguePls,
      }),
    },
  ),
);

/* Browser history integration: the webview/browser back & forward buttons
   drive the same view history the app-side shortcuts use. One pushState per
   pushed entry; popstate restores; back/forward move ONLY through history.
   (Guard flag survives HMR so the listeners never double-install.) */
const w = window as typeof window & { __navWired?: boolean };
if (!w.__navWired) {
  w.__navWired = true;
  window.history.replaceState({ i: 0 }, "");
  window.addEventListener("popstate", (e) => {
    const i = (e.state as { i?: number } | null)?.i;
    if (typeof i === "number") useUi.getState().restoreHistoryIndex(i);
  });
  useUi.subscribe((s, prev) => {
    // a fresh navigation appended an entry (array identity changed + index
    // moved to the new tail): mirror it into the web history
    if (s.viewHistory !== prev.viewHistory && s.viewHistoryIndex > prev.viewHistoryIndex && s.viewHistoryIndex === s.viewHistory.length - 1) {
      window.history.pushState({ i: s.viewHistoryIndex }, "");
    }
  });
}
