import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useContextMenu } from "@/state/contextMenuStore";

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
  const estH = items.length * 34 + 16;
  const px = Math.min(x, window.innerWidth - W - 12);
  const py = Math.min(y, window.innerHeight - estH - 12);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="ctx"
          className="clip-notch fixed z-[90] bg-panel py-2 backdrop-blur-xl"
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
          {items.map((item, i) =>
            item.divider ? (
              <div key={`d${i}`} className="my-1.5 h-px" style={{ background: "var(--ato-border)" }} />
            ) : (
              <button
                key={`i${i}`}
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
              </button>
            ),
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
