import type { Grade } from "@/skins/types";

export type { Grade };

/** A track as stored in the library DB and moved around the app. */
export interface TrackMeta {
  id: number;
  /** unique key: absolute-ish path or synthesized from name+size+mtime */
  path: string;
  fileName: string;
  title: string;
  artist: string;
  artists: string[];
  album: string;
  albumArtist: string;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  genre: string[];
  duration: number;
  format: string;
  bitrate: number | null; // kbps
  sampleRate: number | null; // Hz
  bitDepth: number | null;
  lossless: boolean;
  grade: Grade;
  coverKey: string | null;
  /** raw lyric text: LRC-timestamped when available, plain otherwise */
  lyrics?: string;
  /** learned loudness correction in dB (smart volume; null while unmeasured) */
  gainDb?: number;
  /** the source file is a video container: playable in the visual panel/theatre */
  hasVideo?: boolean;
  /** playback origin: local file or cloud object (path = R2 object key) */
  source?: "local" | "cloud";
  /** this song also exists in the server's shared catalogue (follows the
   *  surviving copy of the merge, which may be a local or personal one) */
  inCatalogue?: boolean;
  /** false = the browser cannot decode this codec */
  playable?: boolean;
  addedAt: number;
  playCount: number;
  lastPlayedAt: number | null;
}

/** Video containers accepted at import: they play as tracks (audio) and show
 *  their picture in the visual panel / theatre mode. */
export const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "webm", "mov", "mkv"]);

/** Container brands / video codecs that also mean "has a video track": covers
 *  legacy rows that stored the raw MP4 brand ("isomiso2") and webm codec names
 *  ("vp9" for video vs "opus"/"vorbis" for audio-only). No audio format or
 *  codec contains these substrings. */
const VIDEO_FORMAT_HINTS = /isom|iso2|quicktime|matroska|vp8|vp9|av01|av1|hvc1|hevc|avc/;

export function isVideoFormat(format: string): boolean {
  const f = format.toLowerCase();
  return VIDEO_EXTENSIONS.has(f) || VIDEO_FORMAT_HINTS.test(f);
}

/** Formats Chromium-based engines cannot decode. */
const UNSUPPORTED_CODECS = new Set(["wma", "aiff", "aif", "cdda", "ape", "dsf", "dsdiff", "wv", "shn", "ac3"]);

export function isPlayableFormat(format: string): boolean {
  return !UNSUPPORTED_CODECS.has(format.toLowerCase());
}

export const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "wav",
  "wave",
  "m4a",
  "aac",
  "ogg",
  "oga",
  "opus",
  "aif",
  "aiff",
  "alac",
  "webm",
  "wma",
]);

const LOSSLESS_FORMATS = new Set(["flac", "wav", "wave", "aiff", "aif", "alac"]);

export function gradeFor(format: string, bitrate: number | null, lossless: boolean): Grade {
  const f = format.toLowerCase();
  if (lossless || LOSSLESS_FORMATS.has(f)) return "SSR";
  const br = bitrate ?? 0;
  if (br >= 320) return "SR";
  if (br >= 256) return "R";
  return "N";
}

/** Separators raw genre tags commonly arrive with ("Rock; Pop" is ONE ID3 element). */
const GENRE_SEPARATORS = /[;,/|、／]/;

/** Normalize a genre array: split multi-value strings, trim, drop empties, dedupe case-insensitively. */
export function splitGenres(genres: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of genres ?? []) {
    for (const part of raw.split(GENRE_SEPARATORS)) {
      const g = part.trim();
      if (!g) continue;
      const key = g.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(g);
    }
  }
  return out;
}

/** Stable cover-art key for an album. */
export function coverKeyFor(album: string, albumArtist: string): string {
  const str = `${album}::${albumArtist}`;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return `cv_${(h >>> 0).toString(36)}`;
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "--:--";
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? h + ":" : ""}${mm}:${String(s).padStart(2, "0")}`;
}
