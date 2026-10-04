import { ChevronDown } from "lucide-react";
import { showContextMenu } from "@/state/contextMenuStore";

/**
 * MenuSelect: a compact trigger that opens its options in the app's custom
 * context menu (clip-notch panel, accent hover) instead of a native select.
 * The current value is marked with a ✓ in the menu's JP slot.
 */
export function MenuSelect({
  value,
  options,
  onChange,
  placeholder,
  className = "",
  ariaLabel,
}: {
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  ariaLabel?: string;
}) {
  const current = options.find((o) => o.value === value) ?? null;
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(
          e,
          options.map((o) => ({
            label: o.label,
            ...(value === o.value ? { jp: "✓" } : {}),
            run: () => onChange(o.value),
          })),
        );
      }}
      aria-label={ariaLabel}
      aria-haspopup="menu"
      className={`font-mono flex items-center justify-between gap-1.5 bg-transparent px-2 py-1 text-[11px] outline-none transition-colors hover:text-accent ${className}`}
      style={{ border: "1px solid var(--ato-border)" }}
    >
      <span className={current ? "" : "text-dim"}>{current?.label ?? placeholder}</span>
      <ChevronDown className="h-3 w-3 shrink-0 text-dim" />
    </button>
  );
}
