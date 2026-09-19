import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Cloud, Download, Link2, ListMusic, Loader2, Search, X } from "lucide-react";
import {
  companionDownload,
  companionHealth,
  companionPlaylist,
  companionSearch,
  isHttpUrl,
  isSpotifyUrl,
  type RemoteHit,
} from "@/core/remote/companion";
import { authActive, useAuth } from "@/core/auth/authStore";
import { probeDuration, remoteDownload, uploadCover } from "@/core/remote/remoteDownload";
import { fetchManifest, streamUrlFor } from "@/core/cloud/cloudService";
import { useCloud } from "@/core/cloud/cloudStore";
import { importWithOverrides } from "@/core/library/importService";
import { coverKeyFor, formatTime } from "@/core/library/types";
import { storeCover } from "@/core/library/coverCache";
import { toast } from "@/state/toastStore";

type Phase =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "results"; hits: RemoteHit[] }
  | { kind: "downloading"; label: string }
  | { kind: "error"; message: string; jp?: string };

interface PlaylistJob {
  title: string;
  items: { title: string; url: string; status: "pending" | "active" | "done" | "failed" }[];
}

/**
 * ADD URL panel — add songs from streaming links. Two paths:
 *  - signed in: the worker downloads server-side (Cobalt-compatible API)
 *    straight into the account library — works on phones / any browser.
 *  - not signed in: the local yt-dlp companion (desktop convenience).
 */
export function AddUrlPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [input, setInput] = useState("");
  const [companion, setCompanion] = useState<{ online: boolean; ytdlp: string | null }>({
    online: false,
    ytdlp: null,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [asVideo, setAsVideo] = useState(false);
  const [pl, setPl] = useState<PlaylistJob | null>(null);
  const busy = phase.kind === "downloading" || phase.kind === "searching";

  useEffect(() => {
    if (!open) return;
    setPhase({ kind: "idle" });
    setInput("");
    setPl(null);
    setCompanion({ online: false, ytdlp: null });
    setTimeout(() => inputRef.current?.focus(), 30);
    companionHealth()
      .then((h) => setCompanion({ online: true, ytdlp: h.ytdlp }))
      .catch(() => setCompanion({ online: false, ytdlp: null }));
  }, [open]);

  /** One track through either import path; resolves with its title. */
  const importOne = async (url: string, video = false): Promise<string> => {
    if (authActive()) {
      // cloud path: the worker downloads server-side into the account library
      const r = await remoteDownload(url);
      const artist = r.artist.trim() || "Unknown";
      const album = artist;
      const coverKey = coverKeyFor(album, artist);
      if (r.thumbnailUrl) {
        // best-effort cover from the source thumbnail
        try {
          const res = await fetch(r.thumbnailUrl);
          const blob = res.ok ? await res.blob() : null;
          if (blob) await uploadCover(coverKey, blob);
        } catch {
          /* cover is optional */
        }
      }
      const duration = await probeDuration(streamUrlFor(r.key));
      const manifest = await fetchManifest();
      if (!manifest.tracks.some((t) => t.key === r.key)) {
        manifest.tracks.push({
          key: r.key,
          coverKey: r.thumbnailUrl ? coverKey : null,
          lyrics: null,
          title: r.title,
          artist,
          artists: [artist],
          album,
          albumArtist: artist,
          trackNo: null,
          discNo: null,
          year: null,
          genre: [],
          duration: duration ?? 0,
          format: r.ext,
          bitrate: null,
          sampleRate: null,
          bitDepth: null,
          lossless: false,
          size: 0,
        });
        const { putManifest } = await import("@/core/cloud/cloudService");
        await putManifest(manifest);
      }
      await useCloud.getState().refresh();
      toast(`Added ${r.title} to your cloud library`, "success", "クラウドに追加");
      return r.title;
    }

    // companion path (desktop, yt-dlp local)
    const { file, meta } = await companionDownload(url, video);
    const artist = meta.artist.trim() || "Unknown";
    const album = artist; // group channel downloads like singles
    const res = await importWithOverrides(file, {
      title: meta.title,
      artist,
      album,
      duration: meta.duration,
      format: meta.ext,
    });
    if (meta.thumbnail) {
      // best effort — the file itself has no embedded art
      void fetch(meta.thumbnail)
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => (blob ? storeCover(coverKeyFor(album, artist), blob) : null))
        .catch(() => {});
    }
    if (res.added + res.updated === 0 && res.skipped === 0) throw new Error("import failed");
    toast(`Added ${meta.title} — ${artist}`, res.updated ? "info" : "success", "追加しました");
    return meta.title;
  };

  const download = async (url: string, video = false) => {
    setPhase({ kind: "downloading", label: video ? "DOWNLOADING VIDEO — 動画ダウンロード中" : "DOWNLOADING — ダウンロード中" });
    try {
      await importOne(url, video);
      onClose();
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "download failed" });
    }
  };

  /** Paste a playlist URL → expand → import every entry sequentially. */
  const importPlaylist = async (url: string) => {
    setPhase({ kind: "searching" });
    try {
      const exp = await companionPlaylist(url);
      const items = exp.entries.map((e) => ({ title: e.title, url: e.url, status: "pending" as const }));
      setPl({ title: exp.title, items });
      setPhase({ kind: "idle" });
      let failed = 0;
      for (let i = 0; i < items.length; i++) {
        setPl((prev) =>
          prev ? { ...prev, items: prev.items.map((it, j) => (j === i ? { ...it, status: "active" } : it)) } : prev,
        );
        try {
          await importOne(items[i].url);
          setPl((prev) =>
            prev ? { ...prev, items: prev.items.map((it, j) => (j === i ? { ...it, status: "done" } : it)) } : prev,
          );
        } catch {
          failed++;
          setPl((prev) =>
            prev ? { ...prev, items: prev.items.map((it, j) => (j === i ? { ...it, status: "failed" } : it)) } : prev,
          );
        }
      }
      toast(
        failed === 0 ? "Playlist imported" : `Playlist import finished — ${failed} failed`,
        failed === 0 ? "success" : "error",
        "プレイリスト取り込み",
      );
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "playlist expansion failed" });
    }
  };

  const submit = async () => {
    const q = input.trim();
    if (!q || busy) return;
    if (isHttpUrl(q)) {
      if (isSpotifyUrl(q)) {
        setPhase({
          kind: "error",
          message:
            "Spotify is DRM-protected and cannot be downloaded — find the track on YouTube and paste that link",
          jp: "SpotifyはDRM保護のためダウンロードできません",
        });
        return;
      }
      // playlist URLs expand into a batch import; everything else downloads solo
      if (/list=|\/playlist\//.test(q)) {
        await importPlaylist(q);
        return;
      }
      await download(q, asVideo);
      return;
    }
    setPhase({ kind: "searching" });
    try {
      const hits = await companionSearch(q);
      if (hits.length === 0) setPhase({ kind: "error", message: `No results for “${q}”` });
      else setPhase({ kind: "results", hits });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "search failed" });
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="addurl"
          className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={onClose}
        >
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ato-bg) 62%, transparent)" }} />
          <motion.div
            className="clip-notch relative w-[min(680px,92vw)] bg-panel backdrop-blur-xl"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
            initial={{ y: -18, opacity: 0, skewX: -3 }}
            animate={{ y: 0, opacity: 1, skewX: 0 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: "var(--ato-accent)" }}>
                ▞ ADD URL
              </span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                  else if (e.key === "Escape") onClose();
                }}
                placeholder="Paste a link, or search YouTube…"
                className="font-mono flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
                disabled={busy}
              />
              <span className="font-mono text-[9px] tracking-[0.2em] text-dim">ESC</span>
            </div>

            <div className="max-h-[52vh] min-h-[120px] overflow-y-auto p-4">
              {phase.kind === "idle" && (
                <p className="font-mono px-1 py-3 text-[10px] leading-relaxed tracking-[0.15em] text-dim">
                  <Link2 className="mr-2 inline h-3.5 w-3.5" />
                  PASTE A YOUTUBE / SOUNDCLOUD / BANDCAMP LINK — OR TYPE TO SEARCH YOUTUBE.
                  <br />
                  SPOTIFY IS DRM-PROTECTED AND CANNOT BE DOWNLOADED.
                </p>
              )}
              {phase.kind === "searching" && (
                <p className="flex items-center gap-2 px-1 py-3 text-sm text-dim">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching — 検索中…
                </p>
              )}
              {phase.kind === "downloading" && (
                <p className="flex items-center gap-2 px-1 py-3 text-sm text-dim">
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--ato-accent)" }} /> {phase.label}…
                </p>
              )}
              {pl && (
                <div className="px-1 py-2">
                  <div className="font-mono mb-2 flex items-center justify-between text-[10px] tracking-[0.2em] text-dim">
                    <span className="flex items-center gap-2">
                      <ListMusic className="h-3.5 w-3.5" style={{ color: "var(--ato-accent)" }} />
                      {pl.title.toUpperCase()}
                    </span>
                    <span>
                      {pl.items.filter((i) => i.status === "done").length}/{pl.items.length}
                      {pl.items.some((i) => i.status === "failed") ? ` · ${pl.items.filter((i) => i.status === "failed").length} FAILED` : ""}
                    </span>
                  </div>
                  <ul className="max-h-64 overflow-y-auto">
                    {pl.items.map((it, i) => (
                      <li
                        key={`${it.url}-${i}`}
                        className="flex items-center gap-3 px-2 py-1.5 text-[12px]"
                        style={{ borderBottom: "1px solid var(--ato-border)" }}
                      >
                        <span className="w-4 shrink-0 text-center">
                          {it.status === "active" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                          ) : it.status === "done" ? (
                            <Check className="h-3.5 w-3.5 text-accent" />
                          ) : it.status === "failed" ? (
                            <X className="h-3.5 w-3.5" style={{ color: "var(--ato-danger)" }} />
                          ) : (
                            <span className="font-mono text-[10px] text-dim">{i + 1}</span>
                          )}
                        </span>
                        <span className={`min-w-0 flex-1 truncate ${it.status === "failed" ? "text-dim line-through" : ""}`}>
                          {it.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {phase.kind === "error" && (
                <div className="px-1 py-3">
                  <p className="text-sm" style={{ color: "var(--ato-danger)" }}>
                    {phase.message}
                  </p>
                  {phase.jp && <p className="font-jp mt-1 text-[11px] text-dim">{phase.jp}</p>}
                  {!authActive() && !companion.online && (
                    <p className="font-mono mt-3 text-[10px] tracking-[0.15em] text-dim">
                      COMPANION OFFLINE — RUN <span style={{ color: "var(--ato-accent)" }}>npm run companion</span> IN THE PROJECT FOLDER
                    </p>
                  )}
                  {!authActive() && companion.online && !companion.ytdlp && (
                    <p className="font-mono mt-3 text-[10px] tracking-[0.15em] text-dim">
                      yt-dlp NOT FOUND — INSTALL WITH <span style={{ color: "var(--ato-accent)" }}>pip install yt-dlp</span>
                    </p>
                  )}
                </div>
              )}
              {phase.kind === "results" && (
                <div className="flex flex-col">
                  {phase.hits.map((hit) => (
                    <div
                      key={hit.url}
                      className="group flex items-center gap-3 px-2 py-2"
                      style={{ borderBottom: "1px solid var(--ato-border)" }}
                    >
                      {hit.thumbnail ? (
                        <img src={hit.thumbnail} alt="" className="h-9 w-16 shrink-0 object-cover" />
                      ) : (
                        <span className="h-9 w-16 shrink-0" style={{ background: "var(--ato-border)" }} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{hit.title}</span>
                        <span className="font-mono block truncate text-[10px] text-dim">
                          {hit.uploader}
                          {hit.duration != null ? ` — ${formatTime(hit.duration)}` : ""}
                        </span>
                      </span>
                      <button
                        onClick={() => void download(hit.url)}
                        disabled={busy}
                        className="clip-tag flex shrink-0 items-center gap-2 px-3 py-1.5 disabled:opacity-40"
                        style={{
                          background: "color-mix(in srgb, var(--ato-accent) 14%, transparent)",
                          color: "var(--ato-accent)",
                        }}
                        title="Download into library"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span className="font-mono text-[10px] font-bold tracking-[0.2em]">DL</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="font-mono flex items-center justify-between border-t border-line px-5 py-3 text-[9px] tracking-[0.2em] text-dim">
              {!authActive() && (
                <button
                  onClick={() => setAsVideo(!asVideo)}
                  className="font-mono flex items-center gap-2 text-[9px] tracking-[0.2em] transition-colors"
                  style={{ color: asVideo ? "var(--ato-accent)" : undefined }}
                  title="Download a 720p mp4 instead of audio-only (needs ffmpeg on this machine)"
                >
                  <span
                    className="inline-flex h-3.5 w-3.5 items-center justify-center"
                    style={{
                      border: `1px solid ${asVideo ? "var(--ato-accent)" : "var(--ato-border)"}`,
                      borderRadius: "var(--ato-radius)",
                      background: asVideo ? "var(--ato-accent)" : "transparent",
                      color: "var(--ato-bg)",
                    }}
                  >
                    {asVideo && <Check className="h-2.5 w-2.5" />}
                  </span>
                  AS VIDEO 720P
                </button>
              )}
              <span>
                {authActive()
                  ? "CLOUD DOWNLOADER ✓ — ADDS TO YOUR ACCOUNT"
                  : companion.online
                    ? companion.ytdlp
                      ? `COMPANION ✓ yt-dlp ${companion.ytdlp}`
                      : "COMPANION ✓ — yt-dlp MISSING"
                    : "COMPANION OFFLINE — npm run companion"}
              </span>
              <span className="flex items-center gap-1">
                <Search className="h-3 w-3" /> ENTER
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
