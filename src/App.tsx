import { lazy, Suspense, useEffect } from "react";
import { motion } from "motion/react";
import { SkinProvider } from "@/skins/SkinProvider";
import { NavRail, Director, EdgeDeco, MobileNav } from "@/shell/NavRail";
import { MiniPlayer } from "@/shell/MiniPlayer";
import { MiniBubble } from "@/ui/kit/MiniBubble";
import { BootSequence } from "@/screens/BootSequence";
import { ErrorBoundary } from "@/ui/kit/ErrorBoundary";
import { ReconnectBanner } from "@/ui/kit/ReconnectBanner";
import { NowPlayingOverlay } from "@/screens/NowPlaying";
import { AuthScreen } from "@/screens/AuthScreen";
import { CutIn } from "@/ui/kit/CutIn";
import { CommandPalette } from "@/ui/kit/CommandPalette";
import { ShortcutsOverlay } from "@/ui/kit/ShortcutsOverlay";
import { EditTrackPanel } from "@/ui/kit/EditTrackPanel";
import { AlbumEditPanel } from "@/ui/kit/AlbumEditPanel";
import { PlaylistCreateDialog } from "@/ui/kit/PlaylistCreateDialog";
import { ConfirmDialog } from "@/ui/kit/ConfirmDialog";
import { PlaylistRenameDialog } from "@/ui/kit/PlaylistRenameDialog";
import { ThemeStudio } from "@/ui/kit/ThemeStudio";
import { SleepTimerHost } from "@/ui/kit/SleepTimerHost";
import { WrappedOverlay } from "@/ui/kit/WrappedOverlay";
import { ContextMenuHost } from "@/ui/kit/ContextMenuHost";
import { Toaster } from "@/ui/kit/Toaster";
import { QueuePanel } from "@/ui/kit/QueuePanel";
import { showEditMenu, showShellMenu, editableTarget } from "@/ui/menus";
import { useUi, markBooted } from "@/state/uiStore";
import { usePlayback } from "@/core/audio/playbackStore";
import { engine } from "@/core/audio/AudioEngine";
import { useImporter } from "@/hooks/useImporter";
import { inTauriShell } from "@/core/library/shellIngest";

// three.js (~600KB) lives in its own chunk, loaded behind the boot screen
const ShaderStage = lazy(() => import("@/fx/ShaderStage").then((m) => ({ default: m.ShaderStage })));

export default function App() {
  const booted = useUi((s) => s.booted);
  const setBooted = useUi((s) => s.setBooted);
  const nowPlayingOpen = useUi((s) => s.nowPlayingOpen);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen);
  const toggle = usePlayback((s) => s.toggle);
  const { importDrop, importTauriDrop, rescan } = useImporter();

  // mouse back/forward buttons navigate the view history (button 4/5)
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        useUi.getState().navigateBack();
      } else if (e.button === 4) {
        e.preventDefault();
        useUi.getState().navigateForward();
      }
    };
    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) e.preventDefault();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("auxclick", onAuxClick);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("auxclick", onAuxClick);
    };
  }, []);

  // Every right-click is a custom menu: the WebView's native menu is killed
  // app-wide (capture), and surfaces that didn't open their own menu fall back
  // to the shell menu (or clipboard actions inside text fields). Surfaces with
  // a specific menu stopPropagation in their handlers, so the bubble listener
  // below only ever fires for unhandled targets.
  useEffect(() => {
    const suppress = (e: MouseEvent) => e.preventDefault();
    const fallback = (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("[data-atori-ctxmenu]")) return; // right-click on the open menu itself
      const field = editableTarget(t);
      if (field) {
        showEditMenu(e, field);
        return;
      }
      showShellMenu(e);
    };
    window.addEventListener("contextmenu", suppress, true);
    window.addEventListener("contextmenu", fallback);
    return () => {
      window.removeEventListener("contextmenu", suppress, true);
      window.removeEventListener("contextmenu", fallback);
    };
  }, []);

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

  // Desktop shell: WebView2 doesn't reliably deliver HTML5 drops even with
  // the native interceptor disabled: use Tauri's own drag-drop events,
  // which hand us absolute paths (files or folders) instead.
  useEffect(() => {
    if (!inTauriShell()) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const fn = await getCurrentWebview().onDragDropEvent((ev) => {
          if (ev.payload.type === "drop" && ev.payload.paths.length > 0) {
            void importTauriDrop(ev.payload.paths);
          }
        });
        if (alive) unlisten = fn;
        else fn();
      } catch (e) {
        console.warn("drag-drop events unavailable", e);
      }
    })();
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [importTauriDrop]);

  // global keys (when not typing): space play/pause, ctrl/cmd+K palette,
  // ctrl/cmd+F or / filter, arrows seek/volume, M mute, N next, P previous
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!useUi.getState().paletteOpen);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        useUi.getState().navigate("library");
        setTimeout(() => {
          const filter = document.querySelector<HTMLInputElement>('input[placeholder="SEARCH…"]');
          filter?.focus();
          filter?.select();
        }, 60);
        return;
      }
      // Alt+←/→: back/forward through the view history (mouse side buttons too)
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          useUi.getState().navigateBack();
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          useUi.getState().navigateForward();
          return;
        }
      }
      // Ctrl+1..5: jump straight to a screen (nav order); Ctrl+R: rescan
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const screenIdx = ["1", "2", "3", "4", "5"].indexOf(e.key);
        if (screenIdx >= 0) {
          e.preventDefault();
          useUi.getState().navigate((["home", "library", "cloud", "catalogue", "settings"] as const)[screenIdx]);
          return;
        }
        if (e.key.toLowerCase() === "r") {
          e.preventDefault();
          void rescan();
          return;
        }
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const pb = usePlayback.getState();
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(!useUi.getState().shortcutsOpen);
        return;
      }
      if (e.code === "Space") {
        // a focused button would also "click" on space: double toggle
        if (el instanceof HTMLButtonElement) el.blur();
        e.preventDefault();
        toggle();
        return;
      }
      switch (e.key) {
        case "/": {
          e.preventDefault();
          useUi.getState().navigate("library");
          setTimeout(() => {
            const filter = document.querySelector<HTMLInputElement>('input[placeholder="SEARCH…"]');
            filter?.focus();
            filter?.select();
          }, 60);
          return;
        }
        case "Escape":
          // close panels top-down: Spotify habit: Esc peels layers
          if (useUi.getState().shortcutsOpen) setShortcutsOpen(false);
          else if (useUi.getState().queueOpen) useUi.getState().setQueueOpen(false);
          else if (useUi.getState().nowPlayingOpen) useUi.getState().setNowPlayingOpen(false);
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
  }, [toggle, setPaletteOpen, setShortcutsOpen, rescan]);

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
          <MiniBubble />
          <MobileNav />
        </motion.div>
        <NowPlayingOverlay />
        <QueuePanel />
        <CutIn />
        <CommandPalette />
        <ShortcutsOverlay />
        <EditTrackPanel />
        <AlbumEditPanel />
        <PlaylistCreateDialog />
        <PlaylistRenameDialog />
        <ConfirmDialog />
        <ThemeStudio />
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
