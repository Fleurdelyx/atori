import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useUi } from "@/state/uiStore";
import { useDexie } from "@/core/library/useLibrary";
import { db } from "@/core/library/db";
import { splitGenres } from "@/core/library/types";
import { parseLrc } from "@/core/library/lrc";
import { toast } from "@/state/toastStore";

/** comma / 、 separated free-text list (slashes stay inside single names here) */
function splitList(raw: string): string[] {
  return raw
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * EditTrackPanel: metadata editor over the local Dexie record. Edits are
 * library-side only: the audio file's embedded tags and the cloud manifest
 * copy are untouched, and album regrouping happens via the live query.
 */
export function EditTrackPanel() {
  const editTrackId = useUi((s) => s.editTrackId);
  const setEditTrackId = useUi((s) => s.setEditTrackId);
  const track = useDexie(
    async () => (editTrackId === null ? undefined : db.tracks.get(editTrackId)),
    [editTrackId],
  );

  const [title, setTitle] = useState("");
  const [artists, setArtists] = useState("");
  const [album, setAlbum] = useState("");
  const [albumArtist, setAlbumArtist] = useState("");
  const [year, setYear] = useState("");
  const [genre, setGenre] = useState("");
  const [lyrics, setLyrics] = useState("");

  useEffect(() => {
    if (track) {
      setTitle(track.title);
      setArtists((track.artists.length ? track.artists : [track.artist]).join(", "));
      setAlbum(track.album);
      setAlbumArtist(track.albumArtist);
      setYear(track.year === null ? "" : String(track.year));
      setGenre(track.genre.join(", "));
      setLyrics(track.lyrics ?? "");
    }
  }, [track]);

  const open = editTrackId !== null && !!track;
  const save = () => {
    if (!track) return;
    // blank fields save as "Unknown" rather than keeping the previous value
    const artistList = splitList(artists);
    const parsedYear = parseInt(year, 10);
    const nextTitle = title.trim() || "Unknown";
    const nextArtist = artistList[0] ?? "Unknown";
    const nextAlbum = album.trim() || "Unknown";
    const nextAlbumArtist = albumArtist.trim() || "Unknown";
    void db.tracks.update(track.id, {
      title: nextTitle,
      artist: nextArtist,
      artists: artistList.length ? artistList : ["Unknown"],
      album: nextAlbum,
      albumArtist: nextAlbumArtist,
      year: Number.isFinite(parsedYear) ? parsedYear : null,
      genre: splitGenres(splitList(genre)),
      // empty string removes the property: Dexie drops undefined keys
      lyrics: lyrics.trim() === "" ? undefined : lyrics,
    });
    // cloud tracks: propagate the metadata to the server manifest so every
    // device sees the edit: locally the shadow row already reflects it
    if (track.source === "cloud") {
      void (async () => {
        try {
          const { withManifestLock, fetchManifest, putManifest } = await import("@/core/cloud/cloudService");
          const { useCloud } = await import("@/core/cloud/cloudStore");
          await withManifestLock(async () => {
            const m = await fetchManifest();
            const entry = m.tracks.find((t) => t.key === track.path);
            if (!entry) return;
            entry.title = nextTitle;
            entry.artist = nextArtist;
            entry.artists = artistList.length ? artistList : ["Unknown"];
            entry.album = nextAlbum;
            entry.albumArtist = nextAlbumArtist;
            entry.year = Number.isFinite(parsedYear) ? parsedYear : null;
            entry.genre = splitGenres(splitList(genre));
            entry.lyrics = lyrics.trim() || null;
            await putManifest(m);
          });
          await useCloud.getState().refresh();
        } catch {
          toast("Saved locally (cloud metadata update failed)", "error", "同期失敗");
        }
      })();
    }
    setEditTrackId(null);
    toast("Track updated", "success", "編集を保存");
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
      {open && track && (
        <motion.div
          key="edit-track"
          className="fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={() => setEditTrackId(null)}
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
                ▞ EDIT INFO
              </span>
              <span className="font-jp truncate text-[10px] tracking-[0.15em] text-dim">{track.title} 編集</span>
              <button onClick={() => setEditTrackId(null)} className="text-dim hover:text-accent" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
              {field("TITLE タイトル", title, setTitle, "Title")}
              {field("ARTISTS アーティスト", artists, setArtists, "comma separated")}
              {field("ALBUM アルバム", album, setAlbum, "Album")}
              {field("ALBUM ARTIST", albumArtist, setAlbumArtist, "Album artist")}
              {field("YEAR 年", year, setYear, "YYYY")}
              {field("TAGS タグ", genre, setGenre, "comma separated")}
              <label className="block sm:col-span-2">
                <span className="font-mono mb-1 flex items-center justify-between text-[9px] tracking-[0.3em] text-dim">
                  LYRICS 歌詞
                  {(() => {
                    const parsed = lyrics.trim() === "" ? null : parseLrc(lyrics);
                    if (parsed === null && lyrics.trim() === "") return null;
                    return parsed ? (
                      <span style={{ color: "var(--ato-accent)" }}>SYNCED LRC: {parsed.length} LINES</span>
                    ) : (
                      <span>PLAIN TEXT: STATIC SHEET</span>
                    );
                  })()}
                </span>
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  rows={7}
                  spellCheck={false}
                  placeholder={"Paste plain text or timed LRC:\n[00:12.50]first line\n[00:18.04]second line"}
                  className="font-mono w-full resize-y bg-transparent px-3 py-2 text-xs leading-relaxed outline-none"
                  style={{ border: "1px solid var(--ato-border)" }}
                />
              </label>
            </div>
            <div className="flex items-center justify-between border-t border-line px-5 py-4">
              <span className="font-mono text-[9px] tracking-[0.15em] text-dim">
                EDITS ARE LIBRARY-SIDE: FILE TAGS STAY UNTOUCHED
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
