import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Image as ImageIcon, X } from "lucide-react";
import { useUi } from "@/state/uiStore";
import { createPlaylist, addToPlaylist } from "@/core/library/playlists";
import { toast } from "@/state/toastStore";
import { PictureCropper } from "@/ui/kit/PictureCropper";

/**
 * PlaylistCreateDialog: asks for a name and an optional picture when a new
 * playlist is made (from the pane button or a track's "＋ New playlist").
 * Picked images go through the cropper first; no picture → the playlist
 * falls back to its songs' covers.
 */
export function PlaylistCreateDialog() {
  const state = useUi((s) => s.playlistCreate);
  const setPlaylistCreate = useUi((s) => s.setPlaylistCreate);
  const open = state !== null;
  const [name, setName] = useState("New Playlist");
  const [pic, setPic] = useState<Blob | undefined>(undefined);
  const [pending, setPending] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("New Playlist");
      setPic(undefined);
      setPending(null);
      setPreview(null);
    }
  }, [open]);

  useEffect(() => {
    if (!pic) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(pic);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pic]);

  const create = () => {
    const seeds = state?.seedTrackIds ?? [];
    void createPlaylist(name, pic).then((id) => {
      const rest = seeds.length > 0 ? addToPlaylist(id, seeds) : Promise.resolve();
      void rest.then(() => {
        state?.onCreated?.(id);
        toast("Playlist created", "success", "プレイリストを作成");
      });
      setPlaylistCreate(null);
    });
  };

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          key="playlist-create"
          className="fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={() => setPlaylistCreate(null)}
        >
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ato-bg) 62%, transparent)" }} />
          <motion.div
            className="clip-notch relative w-[min(440px,94vw)] bg-panel backdrop-blur-xl"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: "var(--ato-accent)" }}>
                ▞ NEW PLAYLIST
              </span>
              <span className="font-jp text-[10px] tracking-[0.15em] text-dim">新規プレイリスト</span>
              <button onClick={() => setPlaylistCreate(null)} className="text-dim hover:text-accent" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-4 px-5 py-4">
              {/* picture: chosen image, or the default song-cover look */}
              <button
                onClick={() => fileRef.current?.click()}
                className="group relative h-20 w-20 shrink-0 overflow-hidden"
                style={{
                  borderRadius: "var(--ato-radius)",
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--ato-accent) 22%, transparent), color-mix(in srgb, var(--ato-accent-2) 18%, transparent))",
                  border: "1px dashed var(--ato-border)",
                }}
                title="Choose a picture"
                aria-label="Choose playlist picture"
              >
                {preview ? (
                  <img src={preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-dim">
                    <ImageIcon className="h-5 w-5" strokeWidth={1.5} />
                    <span className="font-mono text-[8px] tracking-[0.15em]">COVERS</span>
                  </span>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <label className="block">
                  <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">NAME 名前</span>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && create()}
                    placeholder="Playlist name"
                    className="font-mono w-full bg-transparent px-3 py-2 text-xs outline-none"
                    style={{ border: "1px solid var(--ato-border)" }}
                  />
                </label>
                {preview && (
                  <p className="font-mono mt-2 text-[9px] leading-relaxed tracking-[0.1em] text-dim">
                    <button className="underline hover:text-accent" onClick={() => setPic(undefined)}>
                      REMOVE PICTURE
                    </button>
                  </p>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f?.type.startsWith("image/")) setPending(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
              <button
                onClick={() => setPlaylistCreate(null)}
                className="font-mono px-4 py-2 text-[10px] tracking-[0.25em] text-dim hover:text-accent"
              >
                CANCEL
              </button>
              <button onClick={create} className="clip-tag px-5 py-2" style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}>
                <span className="font-mono text-[10px] font-bold tracking-[0.3em]">CREATE</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      {pending && (
        <PictureCropper
          file={pending}
          title="PLAYLIST PICTURE"
          onCancel={() => setPending(null)}
          onConfirm={(blob) => {
            setPic(blob);
            setPending(null);
          }}
        />
      )}
    </>
  );
}