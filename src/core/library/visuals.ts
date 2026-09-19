import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { db, type TrackVisual } from "./db";
import { isVideoFormat, type TrackMeta } from "./types";
import { cachedTrackUrl, streamUrlFor } from "@/core/cloud/cloudService";

/**
 * Track visuals — the Spotify-canvas layer. Two flavors:
 *  - attached clip/gif: a separate video/gif stored in Dexie, looping beside the audio
 *  - video tracks: the source file IS a video container; its picture plays in sync
 */

export async function getVisual(trackId: number): Promise<TrackVisual | null> {
  return (await db.visuals.get(trackId)) ?? null;
}

export async function setVisual(trackId: number, file: File): Promise<void> {
  const isGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
  await db.visuals.put({
    trackId,
    blob: file,
    mime: isGif ? "image/gif" : file.type || "video/mp4",
    kind: isGif ? "gif" : "clip",
    createdAt: Date.now(),
  });
}

export async function removeVisual(trackId: number): Promise<void> {
  await db.visuals.delete(trackId);
}

export function useVisual(trackId: number | null | undefined): TrackVisual | null {
  const [visual, setVisual] = useState<TrackVisual | null>(null);
  useEffect(() => {
    if (trackId == null) {
      setVisual(null);
      return;
    }
    const sub = liveQuery(() => db.visuals.get(trackId)).subscribe({
      next: (v) => setVisual(v ?? null),
      error: (e) => console.warn("visual liveQuery", e),
    });
    return () => sub.unsubscribe();
  }, [trackId]);
  return visual;
}

export interface VisualSource {
  url: string;
  kind: "clip" | "gif" | "video";
  /** attached clips loop like a canvas; video files follow the audio clock */
  loop: boolean;
  /** object URLs the caller must revoke */
  owned: boolean;
}

/**
 * Resolve what to show for a track: an attached clip/gif wins, then a video
 * source file (local handle/blob or cloud stream). Null = nothing attached.
 */
export async function resolveVisualSource(track: TrackMeta): Promise<VisualSource | null> {
  const attached = await db.visuals.get(track.id);
  if (attached) {
    return {
      url: URL.createObjectURL(attached.blob),
      kind: attached.kind,
      loop: true,
      owned: true,
    };
  }
  if (!track.hasVideo && !isVideoFormat(track.format)) return null;

  if ((track.source ?? "local") === "cloud") {
    const cached = await cachedTrackUrl(track.path).catch(() => null);
    return { url: cached ?? streamUrlFor(track.path), kind: "video", loop: false, owned: false };
  }

  const { db: database } = await import("./db");
  const src = await database.sources.get(track.path);
  let file: File | null = null;
  if (src?.handle) {
    const h = src.handle as unknown as {
      queryPermission?: (d: { mode: string }) => Promise<PermissionState>;
      requestPermission?: (d: { mode: string }) => Promise<PermissionState>;
      getFile?: () => Promise<File>;
    };
    try {
      let state = (await h.queryPermission?.({ mode: "read" })) ?? "granted";
      if (state !== "granted") state = (await h.requestPermission?.({ mode: "read" })) ?? "denied";
      if (state === "granted" && h.getFile) file = await h.getFile();
    } catch {
      file = src.file ?? null;
    }
  } else {
    file = src?.file ?? null;
  }
  if (!file) return null;
  return { url: URL.createObjectURL(file), kind: "video", loop: false, owned: true };
}
