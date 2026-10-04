import { useEffect } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useContextMenu } from "@/state/contextMenuStore";
import { ScrollFade } from "@/ui/kit/ScrollFade";

// items assemble in one by one (reconstruction) and peel back out in reverse
// on close (deconstruction)
const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.024 } },
  exit: { transition: { staggerChildren: 0.014, staggerDirection: -1 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: 20, skewX: -10 },
  show: { opacity: 1, x: 0, skewX: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, x: -16, skewX: 8, transition: { duration: 0.13, ease: "easeIn" } },
};

/** Portal host for right-click menus; mounted once at the app root. */
export function ContextMenuHost() {
  const { open, x, y, items, close } = useContextMenu();

  useEffect(() => {
    if (!open) return;
    const dismiss = () => close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("blur", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // keep the panel inside the viewport
  const W = 240;
  const estH = Math.min(items.length * 34 + 16, window.innerHeight * 0.7);
  const px = Math.min(x, window.innerWidth - W - 12);
  const py = Math.min(y, window.innerHeight - estH - 12);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="ctx"
          data-atori-ctxmenu=""
          className="clip-notch fixed z-[90] bg-panel backdrop-blur-xl"
          style={{
            left: px,
            top: py,
            width: W,
            border: "1px solid var(--ato-border)",
            boxShadow: "0 16px 50px rgba(0,0,0,.55)",
          }}
          initial={{ opacity: 0, scale: 0.94, skewX: -4 }}
          animate={{ opacity: 1, scale: 1, skewX: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* ScrollFade: long menus (sleep-timer hours) get the auto-fading
              scrollbar instead of the native accent bar */}
          <ScrollFade className="max-h-[70vh] overflow-y-auto py-2">
            <motion.div variants={listVariants} initial="hidden" animate="show" exit="exit">
              {items.map((item, i) =>
                item.divider ? (
                  <motion.div
                    key={`d${i}`}
                    variants={itemVariants}
                    className="my-1.5 h-px"
                    style={{ background: "var(--ato-border)" }}
                  />
                ) : (
                  <motion.button
                    key={`i${i}`}
                    variants={itemVariants}
                    onClick={() => {
                      close();
                      item.run?.();
                    }}
                    className="flex w-full items-center justify-between px-4 py-2 text-left transition-colors hover:bg-accent/10"
                    style={{ color: item.danger ? "var(--ato-danger)" : "var(--ato-text)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background =
                        "color-mix(in srgb, var(--ato-accent) 10%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <span className="text-[12px] font-medium">{item.label}</span>
                    {item.jp && <span className="font-jp text-[9px] tracking-[0.2em] text-dim">{item.jp}</span>}
                  </motion.button>
                ),
              )}
            </motion.div>
          </ScrollFade>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
