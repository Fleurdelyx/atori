import { useEffect, useRef, useState } from "react";
import { engine } from "@/core/audio/AudioEngine";
import { usePlayback } from "@/core/audio/playbackStore";
import { resolveVisualSource, useVisual, type VisualSource } from "@/core/library/visuals";
import { isVideoFormat, type TrackMeta } from "@/core/library/types";

/**
 * TrackVisual — the canvas layer. Shows an attached clip/gif (looping) or a
 * video track's picture, synced to the audio clock: play/pause follow the
 * engine, drift beyond 350ms snaps back. GIFs just loop on their own clock.
 */
export function TrackVisual({
  track,
  className = "",
  rounded = true,
}: {
  track: TrackMeta;
  className?: string;
  rounded?: boolean;
}) {
  const isPlaying = usePlayback((s) => s.isPlaying);
  const position = usePlayback((s) => s.position);
  const [source, setSource] = useState<VisualSource | null>(null);
  const [failed, setFailed] = useState(false);
  const mediaRef = useRef<HTMLVideoElement>(null);
  const lastTrackId = useRef<number | null>(null);

  // resolve the source per track
  useEffect(() => {
    let alive = true;
    setFailed(false);
    // revoke the previous owned URL
    setSource((prev) => {
      if (prev?.owned) URL.revokeObjectURL(prev.url);
      return null;
    });
    void resolveVisualSource(track).then((src) => {
      if (!alive) {
        if (src?.owned) URL.revokeObjectURL(src.url);
        return;
      }
      setSource(src);
      lastTrackId.current = track.id;
    });
    return () => {
      alive = false;
    };
  }, [track.id, track.path]);

  // follow the transport
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !source || source.kind === "gif") return;
    if (isPlaying) void el.play().catch(() => {});
    else el.pause();
  }, [isPlaying, source]);

  // drift correction + seek-follow on the store's position feed (~4Hz)
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !source || source.kind === "gif" || source.loop) return;
    const audioPos = engine.el.duration ? engine.el.currentTime : position;
    if (Math.abs(el.currentTime - audioPos) > 0.35) {
      el.currentTime = Math.max(0, audioPos);
    }
  }, [position, source]);

  // track change: snap the video to the audio's position once loaded
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !source || source.kind === "gif") return;
    const snap = () => {
      el.currentTime = engine.el.currentTime || 0;
    };
    el.addEventListener("loadedmetadata", snap, { once: true });
    return () => el.removeEventListener("loadedmetadata", snap);
  }, [source]);

  if (failed || !source) return null;
  const radius = rounded ? { borderRadius: "var(--ato-radius)", overflow: "hidden" as const } : undefined;

  if (source.kind === "gif") {
    return <img src={source.url} alt="" className={className} style={radius} draggable={false} />;
  }

  return (
    <video
      ref={mediaRef}
      src={source.url}
      muted
      playsInline
      loop={source.loop}
      autoPlay={isPlaying}
      onError={() => setFailed(true)}
      className={className}
      style={radius}
      onEnded={(e) => {
        // video-file tracks end with the audio — hold the last frame
        (e.currentTarget as HTMLVideoElement).pause();
      }}
    />
  );
}

/** Whether a track has anything to show in the visual layer. */
export function useHasVisual(track: TrackMeta | null): boolean {
  const attached = useVisual(track?.id ?? null);
  if (!track) return false;
  return attached != null || !!track.hasVideo || isVideoFormat(track.format);
}
