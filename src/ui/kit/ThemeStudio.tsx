import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Dices, LayoutGrid, Moon, Palette, Sun, X } from "lucide-react";
import { useUi } from "@/state/uiStore";
import { SKINS, DEFAULT_SKIN_ID } from "@/skins/registry";
import type { SkinDef } from "@/skins/types";
import { toast } from "@/state/toastStore";

/**
 * ThemeStudio: Fleurite-style theme switcher: a floating dock (skin filters,
 * rainbow accent rail, shuffle) above a film strip of hover-expanding skin
 * cards. Click a card to apply; accents ride on top of any skin.
 */

const SWATCHES = [
  "#ff5a5a", "#ff7a45", "#ffb347", "#ffd23e", "#d9f04a",
  "#7dff8a", "#47e0d2", "#3ecfff", "#4aa8ff", "#6a6aff",
  "#8b7cff", "#a86bff", "#c86bff", "#ff6ec7", "#ff6e9c",
];

type Filter = "all" | "dark" | "light";

const CARD_TRANSITION = { duration: 0.32, ease: [0.32, 0.72, 0, 1] as const };

/** perceived luminance of the skin's bg token: drives the dark/light filter */
function isDark(skin: SkinDef): boolean {
  const hex = (skin.tokens["--ato-bg"] ?? "#0b0b12").replace("#", "");
  const n = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum < 0.45;
}

function Card({
  skin,
  active,
  expanded,
  onApply,
  onHover,
}: {
  skin: SkinDef;
  active: boolean;
  expanded: boolean;
  onApply: () => void;
  onHover: (hovering: boolean) => void;
}) {
  return (
    <motion.button
      layout
      transition={CARD_TRANSITION}
      animate={{ width: expanded ? 224 : 56 }}
      onClick={onApply}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={`relative h-[280px] shrink-0 cursor-pointer overflow-hidden border transition-shadow ${
        active ? "border-transparent" : ""
      }`}
      style={{
        background: skin.swatch,
        borderColor: active ? "transparent" : "var(--ato-border)",
        boxShadow: active ? "0 0 0 2px var(--ato-text), 0 0 24px rgba(255,255,255,.18)" : "none",
      }}
      aria-label={skin.name}
      aria-pressed={active}
    >
      {expanded && (
        <>
          <span
            className="absolute inset-x-2 bottom-2 truncate rounded-lg px-2 py-1 text-left text-[11px] font-semibold backdrop-blur-sm"
            style={{ background: "rgba(0,0,0,.55)", color: "#fff" }}
          >
            {skin.name}
          </span>
          {active && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onApply(); // clicking the check re-applies = also fine
              }}
              className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full backdrop-blur-sm"
              style={{ background: "rgba(0,0,0,.55)", color: "#fff" }}
              aria-label={`${skin.name} active`}
            >
              <Check size={11} />
            </span>
          )}
        </>
      )}
      {active && !expanded && (
        <span
          className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full"
          style={{ background: "var(--ato-text)", color: "var(--ato-bg)" }}
        >
          <Check size={10} />
        </span>
      )}
    </motion.button>
  );
}

export function ThemeStudio() {
  const open = useUi((s) => s.themeStudioOpen);
  const setOpen = useUi((s) => s.setThemeStudioOpen);
  const skinId = useUi((s) => s.skinId);
  const accentOverride = useUi((s) => s.accentOverride);
  const [filter, setFilter] = useState<Filter>("all");
  const [hovered, setHovered] = useState<string | null>(null);
  const customInput = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const updateArrows = useCallback(() => {
    const el = strip.current;
    if (el === null) return;
    setCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 4 });
  }, []);

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [updateArrows, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const skins = useMemo(() => SKINS.filter((s) => filter === "all" || isDark(s) === (filter === "dark")), [filter]);

  const applySkin = (id: string) => {
    useUi.getState().setSkin(id);
    const name = SKINS.find((s) => s.id === id)?.name ?? id;
    toast(`Theme applied: ${name}`, "success", "テーマ適用");
  };

  const shuffle = () => {
    const pool = SKINS.filter((s) => s.id !== skinId);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) applySkin(pick.id);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[75] flex flex-col items-center" role="dialog" aria-label="Theme studio">
          {/* scrim: the live wallpaper/shader shines through */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={{ background: "color-mix(in srgb, var(--ato-bg) 45%, transparent)" }}
            onClick={() => setOpen(false)}
          />

          <div className="relative mt-[9vh] flex w-full flex-col items-center gap-3 px-4">
            {/* the dock */}
            <motion.div
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={CARD_TRANSITION}
              className="clip-notch flex flex-wrap items-center gap-2 px-3 py-1.5 backdrop-blur-xl"
              style={{
                background: "color-mix(in srgb, var(--ato-panel) 88%, transparent)",
                border: "1px solid var(--ato-border)",
                boxShadow: "0 18px 50px rgba(0,0,0,.45)",
              }}
            >
              <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ background: "color-mix(in srgb, var(--ato-bg) 55%, transparent)" }}>
                {(
                  [
                    ["all", LayoutGrid],
                    ["dark", Moon],
                    ["light", Sun],
                  ] as const
                ).map(([id, Icon]) => (
                  <button
                    key={id}
                    onClick={() => setFilter(id)}
                    aria-label={`${id} themes`}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                    style={{
                      background: filter === id ? "var(--ato-accent)" : "transparent",
                      color: filter === id ? "var(--ato-bg)" : "var(--ato-text-dim)",
                    }}
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </div>

              <div className="mx-1 h-5 w-px" style={{ background: "var(--ato-border)" }} />

              {/* rainbow accent rail: click = accent color, rides on any skin */}
              <Palette className="h-3.5 w-3.5 text-dim" />
              <div className="flex items-center gap-1">
                {SWATCHES.map((color) => (
                  <button
                    key={color}
                    onClick={() => useUi.getState().setAccentOverride(color)}
                    aria-label={`Accent ${color}`}
                    className="h-5 w-4 -skew-x-12 rounded-[4px] transition-transform duration-200 ease-out hover:scale-110"
                    style={{
                      background: color,
                      boxShadow:
                        (accentOverride ?? "").toLowerCase() === color.toLowerCase()
                          ? "0 0 0 2px var(--ato-text), 0 0 0 3.5px rgba(0,0,0,.4)"
                          : "none",
                    }}
                  />
                ))}
                <button
                  onClick={() => customInput.current?.click()}
                  aria-label="Custom accent color"
                  className="h-5 w-4 -skew-x-12 rounded-[4px] transition-transform duration-200 ease-out hover:scale-110"
                  style={{
                    background: "conic-gradient(#ff5a5a,#ffd23e,#7dff8a,#3ecfff,#8b7cff,#ff6ec7,#ff5a5a)",
                    boxShadow:
                      accentOverride && !SWATCHES.includes(accentOverride.toLowerCase())
                        ? "0 0 0 2px var(--ato-text), 0 0 0 3.5px rgba(0,0,0,.4)"
                        : "none",
                  }}
                />
                <input
                  ref={customInput}
                  type="color"
                  value={accentOverride ?? "#ff2e88"}
                  onChange={(e) => useUi.getState().setAccentOverride(e.target.value)}
                  className="sr-only"
                />
                <button
                  onClick={() => useUi.getState().setAccentOverride(null)}
                  className="font-mono text-[9px] tracking-[0.15em] text-dim hover:text-accent"
                  title="Back to the skin's default accent"
                >
                  RESET
                </button>
              </div>

              <div className="mx-1 h-5 w-px" style={{ background: "var(--ato-border)" }} />

              <button
                onClick={shuffle}
                aria-label="Shuffle theme"
                className="flex h-7 w-7 items-center justify-center rounded-full text-dim transition-colors hover:text-accent"
                title="Random theme"
              >
                <Dices size={15} />
              </button>
              <span className="font-mono min-w-14 text-center text-[10px] text-dim">
                {skins.length} / {SKINS.length}
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close theme studio"
                className="flex h-7 w-7 items-center justify-center rounded-full text-dim transition-colors hover:text-accent"
              >
                <X size={15} />
              </button>
            </motion.div>

            {/* film strip */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={CARD_TRANSITION}
              className="relative w-full max-w-[min(980px,94vw)]"
            >
              {canScroll.left && (
                <button
                  onClick={() => strip.current?.scrollBy({ left: -440, behavior: "smooth" })}
                  aria-label="Scroll left"
                  className="absolute top-1/2 -left-3 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-dim backdrop-blur-xl transition-colors hover:text-accent"
                  style={{ background: "color-mix(in srgb, var(--ato-panel) 88%, transparent)", border: "1px solid var(--ato-border)" }}
                >
                  ‹
                </button>
              )}
              {canScroll.right && (
                <button
                  onClick={() => strip.current?.scrollBy({ left: 440, behavior: "smooth" })}
                  aria-label="Scroll right"
                  className="absolute top-1/2 -right-3 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-dim backdrop-blur-xl transition-colors hover:text-accent"
                  style={{ background: "color-mix(in srgb, var(--ato-panel) 88%, transparent)", border: "1px solid var(--ato-border)" }}
                >
                  ›
                </button>
              )}
              <div
                ref={strip}
                onScroll={updateArrows}
                className="scrollbar-none flex items-center gap-1.5 overflow-x-auto px-2 py-4"
                style={{ justifyContent: "safe center" }}
              >
                {skins.map((s) => (
                  <Card
                    key={s.id}
                    skin={s}
                    active={s.id === skinId}
                    expanded={hovered === s.id}
                    onApply={() => applySkin(s.id)}
                    onHover={(h) => setHovered(h ? s.id : null)}
                  />
                ))}
                {skins.length === 0 && (
                  <div
                    className="font-mono flex h-[280px] w-full items-center justify-center text-[10px] tracking-[0.3em] text-dim"
                    style={{ border: "1px dashed var(--ato-border)", borderRadius: "var(--ato-radius)" }}
                  >
                    NO {filter.toUpperCase()} SKINS
                  </div>
                )}
              </div>
            </motion.div>

            {skinId !== DEFAULT_SKIN_ID && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => applySkin(DEFAULT_SKIN_ID)}
                className="font-mono text-[9px] tracking-[0.3em] text-dim hover:text-accent"
              >
                RESET TO DEFAULT THEME
              </motion.button>
            )}
          </div>

          {/* hidden native color input lives at dialog level for reliability */}
        </div>
      )}
    </AnimatePresence>
  );
}
