import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useUi } from "@/state/uiStore";
import { db } from "@/core/library/db";
import { splitGenres } from "@/core/library/types";
import { useAllTracks } from "@/core/library/useLibrary";
import { cloudConfigured } from "@/core/cloud/cloudService";
import { toast } from "@/state/toastStore";

function splitList(raw: string): string[] {
  return raw
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * AlbumEditPanel: edits album-level metadata (name, album artist, year,
 * genre) across every track of the album. Local rows update in place;
 * cloud rows update their shadow rows AND the server manifest so the edit
 * follows the album to other devices.
 */
export function AlbumEditPanel() {
  const editAlbumKey = useUi((s) => s.editAlbumKey);
  const setEditAlbumKey = useUi((s) => s.setEditAlbumKey);
  const all = useAllTracks();

  const tracks = useMemo(
    () => (editAlbumKey ? all.filter((t) => `${t.album}::${t.albumArtist}` === editAlbumKey) : []),
    [all, editAlbumKey],
  );
  const first = tracks[0];
  const isCloud = tracks.some((t) => t.source === "cloud");

  const [album, setAlbum] = useState("");
  const [albumArtist, setAlbumArtist] = useState("");
  const [year, setYear] = useState("");
  const [genre, setGenre] = useState("");

  useEffect(() => {
    if (first) {
      setAlbum(first.album);
      setAlbumArtist(first.albumArtist);
      setYear(first.year === null ? "" : String(first.year));
      setGenre(splitGenres(first.genre).join(", "));
    }
  }, [editAlbumKey, first?.id, first?.album, first?.albumArtist]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = editAlbumKey !== null && tracks.length > 0;

  const save = () => {
    if (!first) return;
    // blank fields save as "Unknown" rather than keeping the previous value
    const nextAlbum = album.trim() || "Unknown";
    const nextArtist = albumArtist.trim() || "Unknown";
    const parsedYear = parseInt(year, 10);
    const nextYear = Number.isFinite(parsedYear) ? parsedYear : null;
    const nextGenre = splitGenres(splitList(genre));
    const cloudKeys = tracks.filter((t) => t.source === "cloud").map((t) => t.path);

    void (async () => {
      await db.transaction("rw", db.tracks, async () => {
        for (const t of tracks) {
          await db.tracks.update(t.id, {
            album: nextAlbum,
            albumArtist: nextArtist,
            year: nextYear,
            genre: nextGenre,
          });
        }
      });
      if (isCloud && cloudConfigured()) {
        try {
          const { withManifestLock, fetchManifest, putManifest } = await import("@/core/cloud/cloudService");
          const { useCloud } = await import("@/core/cloud/cloudStore");
          await withManifestLock(async () => {
            const m = await fetchManifest();
            const keySet = new Set(cloudKeys);
            for (const entry of m.tracks) {
              if (!keySet.has(entry.key)) continue;
              entry.album = nextAlbum;
              entry.albumArtist = nextArtist;
              entry.year = nextYear;
              entry.genre = nextGenre;
            }
            await putManifest(m);
          });
          await useCloud.getState().refresh();
        } catch {
          toast("Saved locally (cloud metadata update failed)", "error", "同期失敗");
        }
      }
      toast(`Album updated (${tracks.length} tracks)`, "success", "編集を保存");
    })();
    setEditAlbumKey(null);
  };

  const field = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
    <label className="block">
      <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono w-full bg-transparent px-3 py-2 text-xs outline-none"
        style={{ border: "1px solid var(--ato-border)" }}
      />
    </label>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="edit-album"
          className="fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={() => setEditAlbumKey(null)}
        >
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ato-bg) 62%, transparent)" }} />
          <motion.div
            className="clip-notch relative w-[min(520px,94vw)] bg-panel backdrop-blur-xl"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: "var(--ato-accent)" }}>
                ▞ EDIT ALBUM
              </span>
              <span className="font-jp truncate text-[10px] tracking-[0.15em] text-dim">
                {first.album} アルバム編集 · {tracks.length} TRACKS
              </span>
              <button onClick={() => setEditAlbumKey(null)} className="text-dim hover:text-accent" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
              {field("ALBUM アルバム", album, setAlbum, "Album name")}
              {field("ALBUM ARTIST", albumArtist, setAlbumArtist, "Album artist")}
              {field("YEAR 年", year, setYear, "YYYY")}
              {field("TAGS タグ", genre, setGenre, "comma separated")}
            </div>
            <div className="flex items-center justify-between border-t border-line px-5 py-4">
              <span className="font-mono text-[9px] tracking-[0.15em] text-dim">
                APPLIES TO EVERY TRACK: FILE TAGS STAY UNTOUCHED
              </span>
              <button
                onClick={save}
                className="clip-tag px-5 py-2"
                style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.3em]">SAVE</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
