import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useUi } from "@/state/uiStore";
import { getCachedPlaylists, renamePlaylist } from "@/core/library/playlists";
import { toast } from "@/state/toastStore";

/**
 * PlaylistRenameDialog: asks a new name for an existing playlist (opened
 * from the sidebar rail's right-click menu).
 */
export function PlaylistRenameDialog() {
  const id = useUi((s) => s.playlistRename);
  const setPlaylistRename = useUi((s) => s.setPlaylistRename);
  const open = id != null;
  const [name, setName] = useState("");

  useEffect(() => {
    if (id == null) return;
    setName(getCachedPlaylists().find((p) => p.id === id)?.name ?? "");
  }, [id]);

  const rename = () => {
    if (id == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    void renamePlaylist(id, trimmed).then(() => {
      toast("Playlist renamed", "success", "名前を変更");
      setPlaylistRename(null);
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="playlist-rename"
          className="fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={() => setPlaylistRename(null)}
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
                ▞ RENAME PLAYLIST
              </span>
              <span className="font-jp text-[10px] tracking-[0.15em] text-dim">名前を変更</span>
              <button onClick={() => setPlaylistRename(null)} className="text-dim hover:text-accent" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <label className="block">
                <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">NAME 名前</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && rename()}
                  placeholder="Playlist name"
                  className="font-mono w-full bg-transparent px-3 py-2 text-xs outline-none"
                  style={{ border: "1px solid var(--ato-border)" }}
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
              <button
                onClick={() => setPlaylistRename(null)}
                className="font-mono px-4 py-2 text-[10px] tracking-[0.25em] text-dim hover:text-accent"
              >
                CANCEL
              </button>
              <button
                onClick={rename}
                disabled={!name.trim()}
                className="clip-tag px-5 py-2 disabled:opacity-40"
                style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.3em]">RENAME</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
