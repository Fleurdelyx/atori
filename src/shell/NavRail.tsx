import { lazy, Suspense } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AudioWaveform, Cloud, HomeIcon, LibraryBig, Settings2, Palette } from "lucide-react";
import { useUi, type ViewId } from "@/state/uiStore";
import { useMotion, useSkin } from "@/skins/SkinProvider";
import { SKINS } from "@/skins/registry";
import { ErrorBoundary } from "@/ui/kit/ErrorBoundary";

// screens are code-split — each loads behind its own chunk
const HomeScreen = lazy(() => import("@/screens/HomeScreen").then((m) => ({ default: m.HomeScreen })));
const LibraryScreen = lazy(() => import("@/screens/LibraryScreen").then((m) => ({ default: m.LibraryScreen })));
const AlbumScreen = lazy(() => import("@/screens/AlbumScreen").then((m) => ({ default: m.AlbumScreen })));
const CloudScreen = lazy(() => import("@/screens/CloudScreen").then((m) => ({ default: m.CloudScreen })));
const SettingsScreen = lazy(() => import("@/screens/SettingsScreen").then((m) => ({ default: m.SettingsScreen })));

const NAV: { id: ViewId; label: string; jp: string; icon: typeof HomeIcon }[] = [
  { id: "home", label: "HOME", jp: "ホーム", icon: HomeIcon },
  { id: "library", label: "LIBRARY", jp: "ライブラリ", icon: LibraryBig },
  { id: "cloud", label: "CLOUD", jp: "クラウド", icon: Cloud },
  { id: "settings", label: "SETTINGS", jp: "設定", icon: Settings2 },
];

export function NavRail() {
  const view = useUi((s) => s.view);
  const navigate = useUi((s) => s.navigate);
  const skin = useSkin();
  const skinId = useUi((s) => s.skinId);
  const setSkin = useUi((s) => s.setSkin);

  return (
    <nav className="z-20 hidden w-52 shrink-0 flex-col border-r border-line bg-panel backdrop-blur-md md:flex">
      <div className="flex items-center gap-3 px-5 pt-6 pb-7">
        <AudioWaveform className="h-7 w-7" style={{ color: "var(--ato-accent)" }} strokeWidth={2.2} />
        <div>
          <div className="font-display text-xl leading-none font-bold tracking-widest">ATRI</div>
          <div className="font-jp mt-1 text-[10px] tracking-[0.4em] text-dim">アトリ</div>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-3">
        {NAV.map(({ id, label, jp, icon: Icon }) => {
          const active = view === id || (id === "library" && view === "album");
          return (
            <button
              key={id}
              onClick={() => navigate(id)}
              className="clip-slash group relative flex items-center gap-3 px-4 py-3 text-left"
              style={{
                background: active ? "color-mix(in srgb, var(--ato-accent) 14%, transparent)" : "transparent",
                color: active ? "var(--ato-text)" : "var(--ato-text-dim)",
                transition: "background .2s, color .2s",
              }}
            >
              {active && (
                <motion.span
                  layoutId="nav-marker"
                  className="absolute top-1 bottom-1 left-0 w-[3px]"
                  style={{ background: "var(--ato-accent)" }}
                />
              )}
              <Icon className="h-4 w-4" strokeWidth={2} />
              <span className="flex flex-col">
                <span className="text-[12px] font-semibold tracking-[0.18em]">{label}</span>
                <span className="font-jp text-[9px] tracking-[0.3em] opacity-60">{jp}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-2 px-5 pb-5">
        <button
          onClick={() => {
            const i = SKINS.findIndex((s) => s.id === skinId);
            setSkin(SKINS[(i + 1) % SKINS.length].id);
          }}
          className="group flex items-center gap-2 text-left"
          title="Cycle skin"
        >
          <Palette className="h-3.5 w-3.5 text-dim group-hover:text-accent" />
          <span className="font-mono text-[9px] tracking-[0.2em] text-dim group-hover:text-accent">
            SKIN: {skin.name}
          </span>
        </button>
      </div>
    </nav>
  );
}

/** Mobile bottom navigation — replaces the rail below `md`. */
export function MobileNav() {
  const view = useUi((s) => s.view);
  const navigate = useUi((s) => s.navigate);
  return (
    <nav
      className="z-20 grid grid-cols-4 border-t border-line bg-panel backdrop-blur-md md:hidden"
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

/** Director — animated view switching (enter/exit timelines via motion). */
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
        ATRI // MUSIC VISUAL EXPERIENCE — 音楽と視覚の融合
      </div>
    </div>
  );
}
