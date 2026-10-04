import { lazy, Suspense } from "react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { Cloud, Disc3, LibraryBig, Music2, Palette, PanelLeftClose, PanelLeftOpen, Pin, Plus, Settings2 } from "lucide-react";
import { LogoMark } from "@/ui/kit/LogoMark";
import { PlaylistCover } from "@/ui/kit/PlaylistCover";
import { Heart } from "lucide-react";
import { useFavorites } from "@/core/cloud/favoritesStore";
import { useCataloguePlaylists } from "@/core/cloud/cataloguePlaylistStore";
import { CataloguePlaylistCover } from "@/ui/kit/CataloguePlaylistCover";
import { showContextMenu } from "@/state/contextMenuStore";
import { useUi, type ViewId } from "@/state/uiStore";
import { useMotion, useSkin, cssEase } from "@/skins/SkinProvider";
import { usePlaylists } from "@/core/library/playlists";
import { showPlaylistMenu, showSidebarMenu } from "@/ui/menus";
import { ErrorBoundary } from "@/ui/kit/ErrorBoundary";

// screens are code-split: each loads behind its own chunk
const HomeScreen = lazy(() => import("@/screens/HomeScreen").then((m) => ({ default: m.HomeScreen })));
const LibraryScreen = lazy(() => import("@/screens/LibraryScreen").then((m) => ({ default: m.LibraryScreen })));
const AlbumScreen = lazy(() => import("@/screens/AlbumScreen").then((m) => ({ default: m.AlbumScreen })));
const CloudScreen = lazy(() => import("@/screens/CloudScreen").then((m) => ({ default: m.CloudScreen })));
const CatalogueScreen = lazy(() => import("@/screens/CatalogueScreen").then((m) => ({ default: m.CatalogueScreen })));
const SettingsScreen = lazy(() => import("@/screens/SettingsScreen").then((m) => ({ default: m.SettingsScreen })));

const NAV: { id: ViewId; label: string; jp: string; icon: typeof Music2 }[] = [
  { id: "home", label: "HOME", jp: "ホーム", icon: Music2 },
  { id: "library", label: "LIBRARY", jp: "ライブラリ", icon: LibraryBig },
  { id: "cloud", label: "CLOUD", jp: "クラウド", icon: Cloud },
  { id: "catalogue", label: "CATALOGUE", jp: "カタログ", icon: Disc3 },
  { id: "settings", label: "SETTINGS", jp: "設定", icon: Settings2 },
];

/** label cut: slides in from behind the icon edge with a skewed settle —
 *  deliberately blur-free (blur reads soft/bouncy; a hard skew reads slash) */
const labelVariants = (slash: [number, number, number, number]) => ({
  collapsed: { opacity: 0, x: -22, skewX: -10 },
  expanded: (i: number) => ({
    opacity: 1,
    x: 0,
    skewX: 0,
    transition: { delay: 0.06 + i * 0.024, duration: 0.26, ease: slash },
  }),
});

export function NavRail() {
  const view = useUi((s) => s.view);
  const navigate = useUi((s) => s.navigate);
  const collapsed = useUi((s) => s.railCollapsed);
  const setRailCollapsed = useUi((s) => s.setRailCollapsed);
  const skin = useSkin();
  const motion_ = useMotion();
  const slash = cssEase(motion_.easeSlash);
  const rail = useAnimationControls();
  const spin = useAnimationControls();
  const labels = labelVariants(slash);
  const widthState = collapsed ? 68 : 208;

  const toggle = () => {
    const next = !collapsed;
    setRailCollapsed(next);
    // whip-crack: the rail body leans into the move, then snaps straight
    void rail.start({ skewX: [next ? -3 : 3, 0] }, { duration: 0.4, ease: slash });
    // full spin keeps the glyph upright: the chevron must always point in
    // the direction the rail is about to move
    void spin.start({ rotate: [0, -360] }, { duration: 0.55, ease: slash });
  };

  return (
    <motion.nav
      className="group/rail relative z-20 hidden shrink-0 flex-col overflow-hidden border-r border-line bg-panel backdrop-blur-md md:flex"
      initial={false}
      animate={{ width: widthState }}
      transition={{ duration: 0.34, ease: slash }}
      onContextMenu={(e) => showSidebarMenu(e)}
    >
      <motion.div animate={rail} className="flex h-full min-h-0 flex-col">
      {/* blade sweep: one soft diagonal light-pass per toggle, the flash moment */}
      <motion.div
        key={collapsed ? "cut-in" : "cut-out"}
        className="pointer-events-none absolute inset-y-[-20%] left-[-30%] z-10 w-24"
        initial={{ x: -60, opacity: 0, skewX: -14 }}
        animate={{ x: 340, opacity: [0, 0.5, 0], skewX: -14 }}
        transition={{ duration: 0.52, ease: slash, times: [0, 0.3, 1] }}
        style={{
          background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--ato-accent) 55%, transparent) 45%, color-mix(in srgb, var(--ato-accent-2) 45%, transparent) 60%, transparent)",
        }}
      />
      {/* toggle lives in the header row in BOTH states so collapsed↔expanded
          is a one-glance flip at the same height; the brand mark collapses away */}
      <div className={`flex items-center pt-6 pb-7 ${collapsed ? "justify-center px-0" : "gap-3 px-5"}`}>
        <div
          className="min-w-0 overflow-hidden"
          style={{ width: collapsed ? 0 : "auto", opacity: collapsed ? 0 : 1, transition: `width .34s ${motion_.easeSlash}, opacity .16s linear` }}
        >
          <LogoMark className="h-9 w-9 shrink-0" />
        </div>
        <div
          className="min-w-0 overflow-hidden"
          style={{ width: collapsed ? 0 : "auto", opacity: collapsed ? 0 : 1, transition: `width .34s ${motion_.easeSlash}, opacity .16s linear` }}
        >
          <motion.div
            className="whitespace-nowrap"
            custom={0}
            variants={labels}
            initial={false}
            animate={collapsed ? "collapsed" : "expanded"}
          >
            <div className="font-display text-xl leading-none font-bold tracking-widest">ATRI</div>
            <div className="font-jp mt-1 text-[10px] tracking-[0.4em] text-dim">アトリ</div>
          </motion.div>
        </div>
        <motion.button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`rounded-full p-1.5 transition-opacity hover:text-accent ${
            collapsed ? "text-dim" : "ml-auto mr-2 opacity-0 focus-visible:opacity-100 group-hover/rail:opacity-100"
          }`}
          animate={spin}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--ato-text) 10%, transparent)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </motion.button>
      </div>

      <div className={`flex flex-col gap-1 ${collapsed ? "px-0" : "px-3"}`}>
        {NAV.map(({ id, label, jp, icon: Icon }, i) => {
          const active = view === id || (id === "library" && view === "album");
          return (
            <button
              key={id}
              onClick={() => navigate(id)}
              title={collapsed ? label : undefined}
              className="clip-slash group relative flex items-center py-3 text-left gap-3"
              style={{
                justifyContent: "flex-start",
                paddingInline: collapsed ? 26 : 16,
                transition: `padding-inline .34s ${motion_.easeSlash}`,
                background: active ? "color-mix(in srgb, var(--ato-accent) 14%, transparent)" : "transparent",
                color: active ? "var(--ato-text)" : "var(--ato-text-dim)",
              }}
            >
              {active && (
                <motion.span
                  layoutId="nav-marker"
                  className="absolute top-1 bottom-1 left-0 w-[3px]"
                  style={{ background: "var(--ato-accent)" }}
                />
              )}
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              <motion.span
                className="flex min-w-0 flex-col overflow-hidden whitespace-nowrap"
                style={{ width: collapsed ? 0 : "auto", transition: `width .34s ${motion_.easeSlash}` }}
                custom={i}
                variants={labels}
                initial={false}
                animate={collapsed ? "collapsed" : "expanded"}
              >
                <span className="text-[12px] font-semibold tracking-[0.18em]">{label}</span>
                <span className="font-jp text-[9px] tracking-[0.3em] opacity-60">{jp}</span>
              </motion.span>
            </button>
          );
        })}
      </div>

      <PinnedPlaylists collapsed={collapsed} />

      <div className={`mt-auto flex flex-col pb-5 ${collapsed ? "items-center gap-2" : "gap-2 px-5"}`}>
        <button
          onClick={() => useUi.getState().setThemeStudioOpen(true)}
          className="group flex items-center gap-2 text-left"
          title="Theme studio: skins, accents"
        >
          <Palette className="h-3.5 w-3.5 text-dim group-hover:text-accent" />
          {!collapsed && (
            <span className="font-mono text-[9px] tracking-[0.2em] text-dim group-hover:text-accent">
              SKIN: {skin.name}
            </span>
          )}
        </button>
      </div>
      </motion.div>
    </motion.nav>
  );
}

/** Spotify-style library sidebar: Liked Songs pinned first, then every
 *  playlist one click away, pinned ones floating to the top with their pin
 *  marker. Collapses to a cover-only rail; the collapse toggle lives in the
 *  header row. */
function PinnedPlaylists({ collapsed }: { collapsed: boolean }) {
  const view = useUi((s) => s.view);
  const pinned = useUi((s) => s.pinnedPlaylists);
  const focus = useUi((s) => s.playlistFocus);
  const openPlaylist = useUi((s) => s.openPlaylist);
  const openLiked = useUi((s) => s.openLiked);
  const likedFocus = useUi((s) => s.likedFocus);
  const likedCount = useFavorites((s) => s.keys.length);
  const savedCatIds = useUi((s) => s.savedCataloguePls);
  const savedCatalogueFocus = useUi((s) => s.savedCatalogueFocus);
  const catPlaylists = useCataloguePlaylists((s) => s.playlists);
  const playlists = usePlaylists();

  // catalogue playlists the user saved into their library (Spotify-style:
  // read-only references, device-local)
  const libraryActive = view === "library" || view === "album";
  const likedActive = libraryActive && likedFocus != null;
  const savedCatalogue = catPlaylists
    .filter((p) => savedCatIds.includes(p.id))
    .map((p) => ({
      ...p,
      key: `cat-${p.id}`,
      active: libraryActive && savedCatalogueFocus?.id === p.id,
    }));

  // pinned first (in pin order), then the rest by creation
  const items = [
    ...pinned.map((id) => playlists.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p),
    ...playlists.filter((p) => !pinned.includes(p.id!)),
  ];

  const openLikedView = () => openLiked();

  if (collapsed) {
    return (
      <motion.div
        key="rail-collapsed"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22, delay: 0.08 }}
        className="mt-4 flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto pb-2"
      >
        <button
          onClick={() => useUi.getState().setPlaylistCreate({})}
          title="New playlist"
          aria-label="New playlist"
          className="p-1.5 text-dim transition-colors hover:text-accent"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={openLikedView}
          title="Liked Songs"
          aria-label="Liked Songs"
          className="flex h-9 w-9 items-center justify-center"
          style={{
            borderRadius: "var(--ato-radius)",
            background: likedActive
              ? "linear-gradient(135deg, var(--ato-accent), var(--ato-accent-2))"
              : "color-mix(in srgb, var(--ato-text) 8%, transparent)",
          }}
        >
          <Heart
            className="h-4 w-4"
            fill={likedActive ? "var(--ato-bg)" : "none"}
            style={{ color: likedActive ? "var(--ato-bg)" : "var(--ato-text-dim)" }}
          />
        </button>
        {savedCatalogue.map((p) => (
          <button
            key={p.key}
            onClick={() => useUi.getState().openSavedCatalogue(p.id)}
            title={p.name}
            aria-label={p.name}
            className="flex w-full justify-center py-1"
            style={{
              background: p.active ? "color-mix(in srgb, var(--ato-accent) 12%, transparent)" : "transparent",
              borderRadius: "var(--ato-radius)",
            }}
          >
            <CataloguePlaylistCover tracks={[]} title={p.name} picKey={p.picKey} className="h-9 w-9" />
          </button>
        ))}
        {items.map((p, i) => {
          const active = libraryActive && focus?.id === p.id;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08 + i * 0.04, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                onClick={() => {
                  useUi.getState().navigate("library");
                  openPlaylist(p.id!);
                }}
                onContextMenu={(e) => showPlaylistMenu(e, p)}
                title={p.name}
                aria-label={p.name}
                className="flex w-full justify-center py-1"
                style={{
                  background: active ? "color-mix(in srgb, var(--ato-accent) 12%, transparent)" : "transparent",
                  borderRadius: "var(--ato-radius)",
                }}
              >
                <PlaylistCover trackIds={p.trackIds} title={p.name} pic={p.pic} className="h-9 w-9" />
              </button>
            </motion.div>
          );
        })}
      </motion.div>
    );
  }

  return (
    <motion.div
      key="rail-expanded"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, delay: 0.08 }}
      className="mt-4 flex min-h-0 flex-1 flex-col"
    >
      <div className="mb-1 px-4">
        <span className="flex flex-col">
          <span className="font-mono text-[9px] font-semibold tracking-[0.35em] text-dim">PLAYLISTS</span>
          <span className="font-jp text-[8px] tracking-[0.3em] text-dim opacity-70">プレイリスト</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {/* Liked Songs: pinned above every playlist */}
        <button
          onClick={openLikedView}
          aria-label="Liked Songs"
          title="Liked Songs"
          className="group flex w-full items-center gap-3 px-2 py-2 text-left"
          style={{
            background: likedActive ? "color-mix(in srgb, var(--ato-accent) 12%, transparent)" : "transparent",
            borderRadius: "var(--ato-radius)",
          }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center"
            style={{
              borderRadius: "var(--ato-radius)",
              background: "linear-gradient(135deg, var(--ato-accent), var(--ato-accent-2))",
            }}
          >
            <Heart className="h-4 w-4" fill="var(--ato-bg)" style={{ color: "var(--ato-bg)" }} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-[12.5px] font-medium"
              style={{ color: likedActive ? "var(--ato-accent)" : "var(--ato-text-dim)" }}
            >
              Liked Songs
            </span>
            <span className="font-mono block truncate text-[9px] tracking-[0.15em] text-dim opacity-70">
              {likedCount} TRACKS
            </span>
          </span>
        </button>
        {savedCatalogue.map((p) => (
          <button
            key={p.key}
            onClick={() => useUi.getState().openSavedCatalogue(p.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              showContextMenu(e, [
                {
                  label: "Remove from your library",
                  jp: "ライブラリから削除",
                  run: () => useUi.getState().toggleSavedCatalogue(p.id),
                },
              ]);
            }}
            aria-label={p.name}
            title={p.name}
            className="group flex w-full items-center gap-3 px-2 py-2 text-left"
            style={{
              background: p.active ? "color-mix(in srgb, var(--ato-accent) 12%, transparent)" : "transparent",
              borderRadius: "var(--ato-radius)",
            }}
          >
            <CataloguePlaylistCover tracks={[]} title={p.name} picKey={p.picKey} className="h-9 w-9" />
            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-[12.5px] font-medium"
                style={{ color: p.active ? "var(--ato-accent)" : "var(--ato-text-dim)" }}
              >
                {p.name}
              </span>
              <span className="font-mono block truncate text-[9px] tracking-[0.15em] text-dim opacity-70">
                {p.trackKeys.length} TRACKS · <span style={{ color: "var(--ato-gold)" }}>CTL</span>
              </span>
            </span>
          </button>
        ))}
        {items.map((p, i) => {
          const isPinned = pinned.includes(p.id!);
          const active = libraryActive && focus?.id === p.id;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.06 + i * 0.035, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                onClick={() => {
                  useUi.getState().navigate("library");
                  openPlaylist(p.id!);
                }}
                onContextMenu={(e) => showPlaylistMenu(e, p)}
                title={p.name}
                className="group flex w-full items-center gap-3 px-2 py-2 text-left transition-colors"
                style={{
                  background: active ? "color-mix(in srgb, var(--ato-accent) 12%, transparent)" : "transparent",
                  borderRadius: "var(--ato-radius)",
                }}
              >
                <PlaylistCover trackIds={p.trackIds} title={p.name} pic={p.pic} className="h-9 w-9" />
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[12.5px] font-medium"
                    style={{ color: active ? "var(--ato-accent)" : "var(--ato-text-dim)" }}
                  >
                    {p.name}
                  </span>
                  <span className="font-mono block truncate text-[9px] tracking-[0.15em] text-dim opacity-70">
                    {isPinned && <Pin className="mr-1 inline h-2.5 w-2.5 align-baseline" fill="currentColor" style={{ color: "var(--ato-accent)" }} />}
                    {p.trackIds.length} TRACKS
                  </span>
                </span>
              </button>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

/** Mobile bottom navigation: replaces the rail below `md`. */
export function MobileNav() {
  const view = useUi((s) => s.view);
  const navigate = useUi((s) => s.navigate);
  return (
    <nav
      className="z-20 grid grid-cols-5 border-t border-line bg-panel backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV.map(({ id, label, jp, icon: Icon }) => {
        const active = view === id || (id === "library" && view === "album");
        return (
          <button
            key={id}
            onClick={() => navigate(id)}
            aria-label={label}
            className="flex flex-col items-center gap-0.5 py-2.5"
            style={{ color: active ? "var(--ato-accent)" : "var(--ato-text-dim)" }}
          >
            <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
            <span className="text-[9px] font-semibold tracking-[0.18em]">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Director: animated view switching (enter/exit timelines via motion). */
export function Director() {
  const view = useUi((s) => s.view);
  const albumKey = useUi((s) => s.albumKey);
  const motion_ = useMotion();

  const spring = { type: "spring" as const, stiffness: motion_.spring.stiffness, damping: motion_.spring.damping };
  void spring;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${view}:${albumKey ?? ""}`}
        className="h-full overflow-y-auto"
        initial={{ opacity: 0, x: 32, skewX: 5 }}
        animate={{ opacity: 1, x: 0, skewX: 0 }}
        exit={{ opacity: 0, x: -24, skewX: -4 }}
        transition={{
          duration: motion_.base,
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        <ErrorBoundary resetKey={`${view}:${albumKey ?? ""}`} label={view.toUpperCase()}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <span className="font-mono animate-pulse text-[10px] tracking-[0.4em] text-dim">LOADING…</span>
              </div>
            }
          >
            {view === "home" && <HomeScreen />}
            {view === "library" && <LibraryScreen />}
            {view === "album" && <AlbumScreen />}
            {view === "cloud" && <CloudScreen />}
            {view === "catalogue" && <CatalogueScreen />}
            {view === "settings" && <SettingsScreen />}
          </Suspense>
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  );
}

/** Vertical decorative mono text on the right edge. */
export function EdgeDeco() {
  return (
    <div className="pointer-events-none absolute top-1/2 right-2 z-10 hidden -translate-y-1/2 xl:block">
      <div className="v-text font-mono text-[9px] tracking-[0.5em] text-dim opacity-40">
        ATRI // MUSIC VISUAL EXPERIENCE · 音楽と視覚の融合
      </div>
    </div>
  );
}
