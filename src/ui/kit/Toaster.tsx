import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { useToasts } from "@/state/toastStore";

/** Gacha-styled toast stack, bottom-right above the mini player. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-6 bottom-24 z-[80] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="clip-slash-both pointer-events-auto flex w-[320px] items-center gap-3 bg-panel px-5 py-3 backdrop-blur-md"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 12px 40px rgba(0,0,0,.45)" }}
            initial={{ x: 120, opacity: 0, skewX: -8 }}
            animate={{ x: 0, opacity: 1, skewX: 0 }}
            exit={{
              x: 90,
              opacity: 0,
              skewX: -6,
              transition: { delay: 0.17, duration: 0.26, ease: [0.3, 0, 0.7, 0.4] },
            }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            {t.kind === "success" ? (
              <CircleCheck className="h-4 w-4 shrink-0" style={{ color: "var(--ato-accent-2)" }} />
            ) : t.kind === "error" ? (
              <CircleAlert className="h-4 w-4 shrink-0" style={{ color: "var(--ato-danger)" }} />
            ) : (
              <Info className="h-4 w-4 shrink-0" style={{ color: "var(--ato-accent)" }} />
            )}
            {/* text goes out first; the panel follows a beat later */}
            <motion.div
              className="min-w-0 flex-1"
              exit={{ opacity: 0, x: 22, transition: { duration: 0.16, ease: "easeIn" } }}
            >
              <div className="truncate text-[13px] font-medium">{t.text}</div>
              {t.jp && <div className="font-jp truncate text-[9px] tracking-[0.25em] text-dim">{t.jp}</div>}
            </motion.div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
