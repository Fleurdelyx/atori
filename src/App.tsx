import { lazy, Suspense, useEffect } from "react";
import { motion } from "motion/react";
import { SkinProvider } from "@/skins/SkinProvider";
import { NavRail, Director, EdgeDeco, MobileNav } from "@/shell/NavRail";
import { MiniPlayer } from "@/shell/MiniPlayer";
import { BootSequence } from "@/screens/BootSequence";
import { ErrorBoundary } from "@/ui/kit/ErrorBoundary";
import { ReconnectBanner } from "@/ui/kit/ReconnectBanner";
import { NowPlayingOverlay } from "@/screens/NowPlaying";
import { AuthScreen } from "@/screens/AuthScreen";
import { CutIn } from "@/ui/kit/CutIn";
import { CommandPalette } from "@/ui/kit/CommandPalette";
import { ShortcutsOverlay } from "@/ui/kit/ShortcutsOverlay";
import { EditTrackPanel } from "@/ui/kit/EditTrackPanel";
import { SleepTimerHost } from "@/ui/kit/SleepTimerHost";
import { WrappedOverlay } from "@/ui/kit/WrappedOverlay";
import { ContextMenuHost } from "@/ui/kit/ContextMenuHost";
import { Toaster } from "@/ui/kit/Toaster";
import { QueuePanel } from "@/ui/kit/QueuePanel";
import { useUi, markBooted } from "@/state/uiStore";
import { usePlayback } from "@/core/audio/playbackStore";
import { engine } from "@/core/audio/AudioEngine";
import { useImporter } from "@/hooks/useImporter";

// three.js (~600KB) lives in its own chunk, loaded behind the boot screen
const ShaderStage = lazy(() => import("@/fx/ShaderStage").then((m) => ({ default: m.ShaderStage })));

export default function App() {
  const booted = useUi((s) => s.booted);
  const setBooted = useUi((s) => s.setBooted);
  const nowPlayingOpen = useUi((s) => s.nowPlayingOpen);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen);
  const toggle = usePlayback((s) => s.toggle);
  const { importDrop } = useImporter();

  // drag & drop anywhere in the app imports into the local library.
  // window-level (not per-screen) so drops on nav/overlays/settings work too
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const dt = e.dataTransfer;
      if (dt && (dt.items.length > 0 || dt.files.length > 0)) void importDrop(dt);
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", onDrop);
    };
  }, [importDrop]);

  // global keys (when not typing): space play/pause, ctrl/cmd+K palette,
  // arrows seek/volume, M mute, N next, P previous
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!useUi.getState().paletteOpen);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setShortcutsOpen(!useUi.getState().shortcutsOpen);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const pb = usePlayback.getState();
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(!useUi.getState().shortcutsOpen);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
        return;
      }
      switch (e.key) {
        case "Escape":
          if (useUi.getState().shortcutsOpen) setShortcutsOpen(false);
          return;
        case "ArrowRight":
          e.preventDefault();
          engine.seek(engine.getPosition() + 5);
          return;
        case "ArrowLeft":
          e.preventDefault();
          engine.seek(engine.getPosition() - 5);
          return;
        case "ArrowUp":
          e.preventDefault();
          pb.setVolume(Math.min(1, Number((pb.volume + 0.05).toFixed(2))));
          return;
        case "ArrowDown":
          e.preventDefault();
          pb.setVolume(Math.max(0, Number((pb.volume - 0.05).toFixed(2))));
          return;
        case "m":
        case "M":
          pb.muteToggle();
          return;
        case "n":
        case "N":
          void pb.next();
          return;
        case "p":
        case "P":
          void pb.prev();
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, setPaletteOpen, setShortcutsOpen]);

  return (
    <SkinProvider>
      <ErrorBoundary label="APP">
        <Suspense fallback={null}>
          <ShaderStage />
        </Suspense>
        <motion.div
          className="relative z-10 flex h-full flex-col"
          animate={{ opacity: nowPlayingOpen ? 0 : 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          style={{ pointerEvents: nowPlayingOpen ? "none" : undefined }}
        >
          <div className="flex min-h-0 flex-1 pb-14 md:pb-0">
            <NavRail />
            <main className="relative min-w-0 flex-1">
              <Director />
              <EdgeDeco />
            </main>
          </div>
          <MiniPlayer />
          <MobileNav />
        </motion.div>
        <NowPlayingOverlay />
        <QueuePanel />
        <CutIn />
        <CommandPalette />
        <ShortcutsOverlay />
        <EditTrackPanel />
        <SleepTimerHost />
        <WrappedOverlay />
        <AuthScreen />
        <ContextMenuHost />
        <Toaster />
        <ReconnectBanner />
        {!booted && (
          <BootSequence
            onDone={() => {
              markBooted();
              setBooted(true);
            }}
          />
        )}
      </ErrorBoundary>
    </SkinProvider>
  );
}
