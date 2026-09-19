/// <reference lib="webworker" />
import { parseBlob } from "music-metadata";

export interface ParseRequest {
  id: number;
  file: File;
}

export interface ParsedMeta {
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
  bitrate: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  lossless: boolean;
  picture: Blob | null;
  lyrics: string | null;
}

export interface ParseResponse {
  id: number;
  ok: boolean;
  meta?: ParsedMeta;
  error?: string;
}

function titleFromFileName(name: string): { title: string; trackNo: number | null } {
  let base = name.replace(/\.[^.]+$/, "");
  let trackNo: number | null = null;
  const lead = base.match(/^(\d{1,3})\s*[-._)]\s*(.+)$/);
  if (lead) {
    trackNo = parseInt(lead[1], 10);
    base = lead[2];
  }
  return { title: base.trim() || name, trackNo };
}

self.onmessage = async (ev: MessageEvent<ParseRequest>) => {
  const { id, file } = ev.data;
  try {
    const mm = await parseBlob(file, { duration: true });
    const c = mm.common;
    const container = (mm.format.container ?? file.type ?? "").toString();
    const codec = (mm.format.codec ?? "").toString();
    const fmt = (codec || container || file.name.split(".").pop() || "").toLowerCase();
    const fallback = titleFromFileName(file.name);
    const artists = (c.artists ?? (c.artist ? [c.artist] : [])).filter(Boolean);

    const meta: ParsedMeta = {
      title: c.title ?? fallback.title,
      artist: c.artist ?? artists[0] ?? "Unknown Artist",
      artists: artists.length ? artists : [c.artist ?? "Unknown Artist"],
      album: c.album ?? "Unknown Album",
      albumArtist: c.albumartist ?? c.artist ?? "Unknown Artist",
      trackNo: c.track?.no ?? fallback.trackNo,
      discNo: c.disk?.no ?? null,
      year: c.year ?? null,
      genre: c.genre ?? [],
      duration: mm.format.duration ?? 0,
      format: fmt.includes("flac")
        ? "flac"
        : fmt.includes("mpeg")
          ? "mp3"
          : fmt.replace(/[^a-z0-9]/gi, "").slice(0, 8),
      bitrate: mm.format.bitrate ? Math.round(mm.format.bitrate / 1000) : null,
      sampleRate: mm.format.sampleRate ?? null,
      bitDepth: mm.format.bitsPerSample ?? null,
      lossless: (mm.format.lossless ?? false) === true,
      picture: c.picture?.[0]?.data
        ? new Blob([c.picture[0].data as unknown as BlobPart], { type: c.picture[0].format })
        : null,
      lyrics: c.lyrics?.[0]?.text ?? (typeof c.lyrics?.[0] === "string" ? (c.lyrics as unknown as string[])[0] : null),
    };
    const res: ParseResponse = { id, ok: true, meta };
    self.postMessage(res);
  } catch (e) {
    const res: ParseResponse = { id, ok: false, error: String(e) };
    self.postMessage(res);
  }
};
