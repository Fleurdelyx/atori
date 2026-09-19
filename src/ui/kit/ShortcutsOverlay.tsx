import { AnimatePresence, motion } from "motion/react";
import { useUi } from "@/state/uiStore";

const SHORTCUTS: { keys: string; label: string; jp: string }[] = [
  { keys: "SPACE", label: "Play / pause", jp: "再生・一時停止" },
  { keys: "← / →", label: "Seek ±5s", jp: "巻き戻し・早送り" },
  { keys: "↑ / ↓", label: "Volume ±5%", jp: "音量" },
  { keys: "M", label: "Mute", jp: "ミュート" },
  { keys: "N", label: "Next track", jp: "次の曲" },
  { keys: "P", label: "Previous track", jp: "前の曲" },
  { keys: "CTRL K", label: "Command palette", jp: "コマンド" },
  { keys: "?", label: "This cheat sheet", jp: "ショートカット" },
  { keys: "ESC", label: "Close overlays", jp: "閉じる" },
];

/** "?" cheat sheet — every global keyboard shortcut in one overlay. */
export function ShortcutsOverlay() {
  const open = useUi((s) => s.shortcutsOpen);
  const setOpen = useUi((s) => s.setShortcutsOpen);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="shortcuts"
          className="fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={() => setOpen(false)}
        >
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ato-bg) 62%, transparent)" }} />
          <motion.div
            className="clip-notch relative w-[min(460px,92vw)] bg-panel backdrop-blur-xl"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: "var(--ato-accent)" }}>
                ▞ SHORTCUTS
              </span>
              <span className="font-jp text-[10px] tracking-[0.2em] text-dim">キーボード操作</span>
            </div>
            <div className="px-5 py-3">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center gap-4 py-2">
                  <span
                    className="font-mono min-w-[72px] px-2 py-0.5 text-center text-[10px] font-bold tracking-[0.15em]"
                    style={{
                      background: "color-mix(in srgb, var(--ato-text) 8%, transparent)",
                      color: "var(--ato-text)",
                      borderRadius: "var(--ato-radius)",
                    }}
                  >
                    {s.keys}
                  </span>
                  <span className="flex-1 text-[13px] font-medium">{s.label}</span>
                  <span className="font-jp text-[9px] tracking-[0.15em] text-dim">{s.jp}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
