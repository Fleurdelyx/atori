import { AnimatePresence, motion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { useUi } from "@/state/uiStore";
import { useWrapped } from "@/core/library/useLibrary";

/**
 * WrappedOverlay — ATRI's year-in-review: minutes, top track/artist/album/tags
 * derived from the local play log. Recomputed live whenever it opens.
 */
export function WrappedOverlay() {
  const open = useUi((s) => s.wrappedOpen);
  const setOpen = useUi((s) => s.setWrappedOpen);
  const w = useWrapped();

  const hasData = w.plays > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="wrapped"
          className="fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onPointerDown={() => setOpen(false)}
        >
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ato-bg) 72%, transparent)" }} />
          <motion.div
            className="clip-notch relative max-h-[86vh] w-[min(560px,94vw)] overflow-y-auto bg-panel p-8 backdrop-blur-xl"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-1 text-dim hover:text-accent"
              aria-label="Close wrapped"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5" style={{ color: "var(--ato-gold)" }} />
              <div>
                <h2 className="font-display text-2xl font-bold tracking-wide">ATRI WRAPPED</h2>
                <p className="font-mono text-[9px] tracking-[0.3em] text-dim">あなたの年間レポート — FROM YOUR LOCAL PLAY LOG</p>
              </div>
            </div>

            {!hasData ? (
              <p className="mt-10 mb-6 text-center text-sm text-dim">
                Play something first — your stats build themselves as you listen.
                <span className="font-jp mt-2 block">再生履歴がまだありません</span>
              </p>
            ) : (
              <>
                <div className="mt-8 grid grid-cols-3 gap-3 text-center">
                  <Big number={w.minutes} label="MINUTES" />
                  <Big number={w.plays} label="PLAYS" />
                  <Big number={w.uniqueTracks} label="TRACKS" />
                </div>

                {w.topTrack && (
                  <div className="mt-8">
                    <Label>TOP TRACK</Label>
                    <p className="font-display mt-1 text-xl font-bold" style={{ color: "var(--ato-accent)" }}>
                      {w.topTrack.title}
                    </p>
                    <p className="text-[12px] text-dim">
                      {w.topTrack.artist} — {w.topTrack.plays} plays
                    </p>
                  </div>
                )}

                <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
                  <TopList title="ARTISTS" items={w.topArtists} />
                  <TopList title="ALBUMS" items={w.topAlbums} />
                  <TopList title="TAGS" items={w.topTags} />
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Big({ number, label }: { number: number; label: string }) {
  return (
    <div className="clip-notch py-4" style={{ background: "color-mix(in srgb, var(--ato-accent) 8%, transparent)" }}>
      <div className="font-display text-3xl font-bold" style={{ color: "var(--ato-accent)" }}>
        {number.toLocaleString()}
      </div>
      <div className="font-mono mt-1 text-[9px] tracking-[0.3em] text-dim">{label}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[9px] tracking-[0.35em] text-dim">{children}</div>;
}

function TopList({ title, items }: { title: string; items: { name: string; plays: number }[] }) {
  return (
    <div>
      <Label>{title}</Label>
      <ol className="mt-2 space-y-1.5">
        {items.length === 0 && <li className="text-[12px] text-dim">—</li>}
        {items.map((it, i) => (
          <li key={it.name} className="flex items-baseline gap-2 text-[13px]">
            <span className="font-mono text-[10px] text-dim">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1 truncate">{it.name}</span>
            <span className="font-mono text-[10px] text-dim">{it.plays}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
