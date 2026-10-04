import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CloudUpload, Search, X } from "lucide-react";
import { useAllTracks } from "@/core/library/useLibrary";
import { useCatalogue } from "@/core/cloud/catalogueStore";
import { useSync } from "@/core/cloud/syncStore";
import { objectKeyFor } from "@/core/cloud/cloudService";
import { matchTrack } from "@/core/library/search";
import { ScrollFade } from "./ScrollFade";
import type { TrackMeta } from "@/core/library/types";

/**
 * CatalogueUploadPanel: admin picker for publishing tracks to the server's
 * shared catalogue — checklist over the local library, search, select all.
 * Tracks already in the catalogue are marked and start unchecked. Upload
 * hands the selection to the global sync so the Cloud screen shows progress.
 */
export function CatalogueUploadPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const all = useAllTracks();
  // uploads resolve files through the local FS: cloud/catalogue rows can't be
  // published (their bytes live on the server already)
  const local = useMemo(() => all.filter((t) => (t.source ?? "local") === "local"), [all]);
  const catalogue = useCatalogue((s) => s.manifest);
  const catalogueStatus = useCatalogue((s) => s.status);
  const catalogueError = useCatalogue((s) => s.error);

  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const existingKeys = useMemo(() => new Set((catalogue?.tracks ?? []).map((t) => t.key)), [catalogue]);
  const catalogueKeyOf = (t: TrackMeta) => `catalogue/${objectKeyFor(t)}`;

  // opening preselects everything not published yet
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(local.filter((t) => !existingKeys.has(catalogueKeyOf(t))).map((t) => t.id)));
    setQ("");
    // a stale or failed catalogue pull self-heals here too: without the list
    // the IN CATALOGUE marks would under-report and invite re-uploads
    const c = useCatalogue.getState();
    if (c.status !== "loading" && c.manifest === null) void c.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const query = q.trim().toLowerCase();
  const list = useMemo(() => (query ? local.filter((t) => matchTrack(t, query).hit) : local), [local, query]);
  const allShownSelected = list.length > 0 && list.every((t) => selected.has(t.id));

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) for (const t of list) next.delete(t.id);
      else for (const t of list) next.add(t.id);
      return next;
    });

  const upload = () => {
    const picked = local.filter((t) => selected.has(t.id));
    if (picked.length === 0) return;
    onClose();
    void useSync.getState().start("catalogue", picked);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="catalogue-upload"
          className="fixed inset-0 z-[70] flex items-start justify-center pt-[9vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={onClose}
        >
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ato-bg) 62%, transparent)" }} />
          <motion.div
            className="clip-notch relative w-[min(680px,92vw)] bg-panel backdrop-blur-xl"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
            initial={{ y: -18, opacity: 0, skewX: -3 }}
            animate={{ y: 0, opacity: 1, skewX: 0 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: "var(--ato-gold)" }}>
                ▞ UPLOAD TO CATALOGUE
              </span>
              <span className="font-jp text-[10px] tracking-[0.2em] text-dim">カタログへ公開</span>
              <button onClick={onClose} className="ml-auto text-dim hover:text-accent" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 px-5 py-3">
              <label
                className="clip-tag flex flex-1 items-center gap-2 bg-transparent px-3 py-2"
                style={{ border: "1px solid var(--ato-border)" }}
              >
                <Search className="h-3.5 w-3.5 shrink-0 text-dim" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="SEARCH ・ 検索…"
                  className="font-mono w-full bg-transparent text-[11px] tracking-[0.2em] outline-none placeholder:text-dim"
                />
              </label>
              <button
                onClick={toggleAll}
                disabled={list.length === 0}
                className="clip-tag shrink-0 px-3 py-2 disabled:opacity-40"
                style={{
                  background: allShownSelected
                    ? "color-mix(in srgb, var(--ato-accent) 16%, transparent)"
                    : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                  color: allShownSelected ? "var(--ato-accent)" : "var(--ato-text-dim)",
                }}
              >
                <span className="font-mono text-[9px] font-bold tracking-[0.2em]">
                  {allShownSelected ? "CLEAR ALL" : "SELECT ALL"}
                </span>
              </button>
            </div>

            {catalogueStatus === "error" && catalogue === null && (
              <p className="font-mono px-5 pb-1 text-[9px] tracking-[0.15em]" style={{ color: "var(--ato-gold)" }}>
                CATALOGUE LIST UNAVAILABLE · {catalogueError ?? "retrying on open"} — PUBLISHED MARKS MAY BE MISSING
              </p>
            )}
            <ScrollFade className="max-h-[46vh] min-h-[140px] overflow-y-auto px-3 pb-2">
              {list.length === 0 && (
                <p className="font-mono px-2 py-6 text-center text-[11px] text-dim">
                  {local.length === 0 ? "No local tracks: import music first" : "No matches · 該当なし"}
                </p>
              )}
              {list.map((t) => {
                const published = existingKeys.has(catalogueKeyOf(t));
                const checked = selected.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className="group flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent/10"
                  >
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center"
                      style={{
                        border: `1px solid ${checked ? "var(--ato-accent)" : "var(--ato-border)"}`,
                        borderRadius: "var(--ato-radius)",
                        background: checked ? "var(--ato-accent)" : "transparent",
                        color: "var(--ato-bg)",
                      }}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] ${checked ? "font-medium" : "text-dim"}`}>{t.title}</span>
                      <span className="block truncate text-[10px] text-dim">
                        {t.artist} · {t.album}
                      </span>
                    </span>
                    {published && (
                      <span className="font-mono shrink-0 text-[8px] tracking-[0.2em] text-dim">IN CATALOGUE</span>
                    )}
                  </button>
                );
              })}
            </ScrollFade>

            <div className="font-mono flex items-center justify-between border-t border-line px-5 py-3 text-[9px] tracking-[0.2em] text-dim">
              <span>{selected.size} SELECTED</span>
              <button
                onClick={upload}
                disabled={selected.size === 0}
                className="clip-slash-both font-display flex items-center gap-2 px-5 py-2 text-[11px] font-bold tracking-[0.25em] disabled:opacity-40"
                style={{ background: "var(--ato-gold)", color: "var(--ato-bg)" }}
              >
                <CloudUpload className="h-4 w-4" /> UPLOAD
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
