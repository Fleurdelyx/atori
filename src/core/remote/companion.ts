/**
 * Client for the local yt-dlp companion (run `npm run companion`).
 * The companion downloads best-audio for a given public URL and streams the
 * file back with an X-Atori-Meta header carrying its metadata.
 */

const BASE = "http://localhost:8790";

export interface RemoteHit {
  title: string;
  url: string;
  uploader: string;
  duration: number | null;
  thumbnail: string | null;
}

export interface RemoteTrackMeta {
  title: string;
  artist: string;
  duration: number | null;
  thumbnail: string | null;
  ext: string;
}

export type CompanionError = Error & { code?: string };

/** target format for a download; "best" keeps the source codec */
export type DownloadFormat = "best" | "mp3" | "opus" | "wav" | "mp4";

export async function companionHealth(): Promise<{ ok: boolean; ytdlp: string | null }> {
  const r = await fetch(`${BASE}/api/health`);
  if (!r.ok) throw new Error(`companion responded ${r.status}`);
  return r.json();
}

export async function companionSearch(query: string): Promise<RemoteHit[]> {
  const r = await fetch(`${BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = (await r.json().catch(() => ({}))) as { hits?: RemoteHit[]; message?: string; error?: string };
  if (!r.ok) throw createError(data.message ?? data.error ?? `search failed (${r.status})`);
  return data.hits ?? [];
}

export interface PlaylistExpansion {
  title: string;
  count: number;
  truncated: boolean;
  entries: { title: string; url: string; uploader: string; duration: number | null }[];
}

/** Expand a playlist URL into its entries (capped at 50 by the companion). */
export async function companionPlaylist(url: string): Promise<PlaylistExpansion> {
  const r = await fetch(`${BASE}/api/playlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = (await r.json().catch(() => ({}))) as Partial<PlaylistExpansion> & { message?: string; error?: string };
  if (!r.ok) throw createError(data.message ?? data.error ?? `playlist expansion failed (${r.status})`);
  return {
    title: data.title ?? "Playlist",
    count: data.count ?? 0,
    truncated: data.truncated ?? false,
    entries: data.entries ?? [],
  };
}

/** Download a track in the requested format; resolves with a named File ready
 *  for importWithOverrides. "mp4" requests a ≤720p video (needs ffmpeg on the
 *  companion machine), transcoded audio formats likewise. */
export async function companionDownload(url: string, format: DownloadFormat = "best"): Promise<{ file: File; meta: RemoteTrackMeta }> {
  const r = await fetch(`${BASE}/api/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, format }),
  });
  if (!r.ok) {
    const data = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
    throw createError(data.message ?? data.error ?? `download failed (${r.status})`, data.error);
  }
  const raw = r.headers.get("X-Atori-Meta");
  const meta: RemoteTrackMeta = raw
    ? JSON.parse(decodeURIComponent(raw))
    : { title: "download", artist: "", duration: null, thumbnail: null, ext: "m4a" };
  const blob = await r.blob();
  const file = new File([blob], `${safeName(meta.title)}.${meta.ext}`, { type: mimeForExt(meta.ext) });
  return { file, meta };
}

/** The companion reports the real post-processed extension; map it to a mime
 *  music-metadata can sniff without tripping over a mismatched default. */
function mimeForExt(ext: string): string {
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "opus":
    case "ogg":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    case "webm":
      return "audio/webm";
    default:
      return "audio/mp4";
  }
}

export function isSpotifyUrl(url: string): boolean {
  try {
    return /(^|\.)spotify\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function createError(message: string, code?: string): CompanionError {
  const e = new Error(message) as CompanionError;
  e.code = code;
  return e;
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "download";
}
