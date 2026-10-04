import { useCallback, useEffect, useRef } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { usePlayback } from "@/core/audio/playbackStore";

const IDLE_MS = 1000; // fade the diamond out after this much inactivity

/**
 * VolumeControl: mute button + slider, shared by the MiniPlayer and all
 * Now Playing layouts. The diamond thumb auto-fades: it shows while the
 * pointer is over the control (or while the volume is changing: wheel
 * scrolls and hotkeys included) and fades away once idle, matching the seek
 * bar's handle behavior. `wide` swaps to a longer slider for the centered
 * under-transport placement in the Now Playing modes.
 */
export function VolumeControl({ className = "", wide = false }: { className?: string; wide?: boolean }) {
  const volume = usePlayback((s) => s.volume);
  const setVolume = usePlayback((s) => s.setVolume);
  const muteToggle = usePlayback((s) => s.muteToggle);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  const wake = useCallback(() => {
    inputRef.current?.setAttribute("data-live", "1");
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      inputRef.current?.removeAttribute("data-live");
    }, IDLE_MS);
  }, []);

  // wheel over the control adjusts volume: same muscle memory as scrolling
  // the mini player bar. Native non-passive listener so the page underneath
  // (NP panels scroll) doesn't scroll along.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = usePlayback.getState();
      const dir = e.deltaY < 0 ? 1 : -1;
      s.setVolume(Math.min(1, Math.max(0, Number((s.volume + dir * 0.05).toFixed(2)))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  // volume changing without a pointer (wheel over the player, arrow keys)
  // still reveals the diamond
  useEffect(() => {
    wake();
  }, [volume, wake]);

  const muted = volume === 0;
  return (
    <div
      ref={rootRef}
      className={`flex items-center gap-2 ${className}`}
      onPointerEnter={wake}
      onPointerMove={wake}
      onPointerDown={wake}
    >
      <button
        onClick={() => muteToggle()}
        className="cursor-pointer text-dim transition-colors hover:text-accent"
        title={muted ? "Unmute" : "Mute"}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <input
        ref={inputRef}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        className={`ato-slider fade-thumb cursor-pointer ${wide ? "w-44" : "w-24"}`}
        style={{ "--p": `${volume.toFixed(2)}` } as React.CSSProperties}
      />
    </div>
  );
}
