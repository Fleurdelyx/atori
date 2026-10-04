import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useConfirm } from "@/state/confirmStore";

/**
 * ConfirmDialog: the app's single delete-confirmation prompt. Any destructive
 * action awaits the confirm() store helper; this host renders whatever is
 * pending. Confirming resolves true, everything else (cancel, backdrop, Esc)
 * resolves false.
 */
export function ConfirmDialog() {
  const pending = useConfirm((s) => s.pending);
  const settle = useConfirm((s) => s.settle);

  // capture-phase Esc wins over the app's global queue/overlay peel
  useEffect(() => {
    if (!pending) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        settle(false);
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [pending, settle]);

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          key="confirm-dialog"
          className="fixed inset-0 z-[90] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onPointerDown={() => settle(false)}
        >
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ato-bg) 68%, transparent)" }} />
          <motion.div
            className="clip-notch relative w-[min(400px,92vw)] bg-panel backdrop-blur-xl"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
            initial={{ y: -14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line px-5 py-4">
              <div
                className="font-mono text-[10px] tracking-[0.3em]"
                style={{ color: pending.danger ? "var(--ato-danger)" : "var(--ato-accent)" }}
              >
                ▞ {pending.title}
              </div>
              {pending.body && <p className="mt-2 text-sm leading-relaxed text-dim">{pending.body}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                autoFocus
                onClick={() => settle(false)}
                className="font-mono px-4 py-2 text-[10px] tracking-[0.25em] text-dim hover:text-accent"
              >
                CANCEL
              </button>
              <button
                onClick={() => settle(true)}
                className="clip-tag px-5 py-2"
                style={{
                  background: pending.danger ? "var(--ato-danger)" : "var(--ato-accent)",
                  color: "var(--ato-bg)",
                }}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.3em]">
                  {pending.confirmLabel ?? "DELETE"}
                </span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
