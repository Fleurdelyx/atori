import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Cloud,
  Disc3,
  Home as HomeIcon,
  LibraryBig,
  Moon,
  Palette,
  Play,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useUi, type ViewId } from "@/state/uiStore";
import { usePlayback } from "@/core/audio/playbackStore";
import { useAllTracks } from "@/core/library/useLibrary";
import { SKINS } from "@/skins/registry";
import { BG_STYLES } from "@/fx/bgStyles";
import type { TrackMeta } from "@/core/library/types";

interface PaletteItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  run: () => void;
  score: number;
}

function scoreOf(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx < 0) return -1;
  let s = 10 - Math.min(9, idx / 4);
  if (idx === 0) s += 4;
  if (t.startsWith(q + " ")) s += 2;
  return s;
}

/**
 * CommandPalette — Ctrl+K quick actions in gacha dress.
 * Searches the library + runs app actions (navigate, skin, calm mode).
 */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const navigate = useUi((s) => s.navigate);
  const setSkin = useUi((s) => s.setSkin);
  const setBgStyle = useUi((s) => s.setBgStyle);
  const setCalm = useUi((s) => s.setCalm);
  const calm = useUi((s) => s.calm);
  const setNowPlayingOpen = useUi((s) => s.setNowPlayingOpen);
  const tracks = useAllTracks();
  const toggle = usePlayback((s) => s.toggle);
  const playQueue = usePlayback((s) => s.playQueue);

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim();
    const out: PaletteItem[] = [];

    const navs: { view: ViewId; label: string; jp: string; icon: React.ReactNode }[] = [
      { view: "home", label: "Go to Home", jp: "ホーム", icon: <HomeIcon className="h-4 w-4" /> },
      { view: "library", label: "Go to Library", jp: "ライブラリ", icon: <LibraryBig className="h-4 w-4" /> },
      { view: "cloud", label: "Go to Cloud", jp: "クラウド", icon: <Cloud className="h-4 w-4" /> },
      { view: "settings", label: "Go to Settings", jp: "設定", icon: <Settings2 className="h-4 w-4" /> },
    ];
    for (const n of navs) {
      const s = q ? scoreOf(q, `${n.label} ${n.jp}`) : 8;
      if (s >= 0) out.push({ id: `nav:${n.view}`, icon: n.icon, label: n.label, hint: n.jp, run: () => navigate(n.view), score: s });
    }
    const acts: PaletteItem[] = [
      { id: "act:playpause", icon: <Play className="h-4 w-4" />, label: "Play / Pause", hint: "SPACE", run: toggle, score: scoreOf(q, "play pause 再生") },
      { id: "act:np", icon: <Disc3 className="h-4 w-4" />, label: "Open Now Playing", hint: "再生中", run: () => setNowPlayingOpen(true), score: scoreOf(q, "open now playing 再生中") },
      { id: "act:wrapped", icon: <Sparkles className="h-4 w-4" />, label: "ATRI Wrapped — your stats", hint: "年間レポート", run: () => useUi.getState().setWrappedOpen(true), score: scoreOf(q, "atri wrapped stats year review 年間") },
      { id: "act:calm", icon: <Moon className="h-4 w-4" />, label: calm ? "Disable Calm Mode" : "Enable Calm Mode", hint: "マモード", run: () => setCalm(!calm), score: scoreOf(q, "calm motion reduced") },
      ...SKINS.map((s) => ({
        id: `skin:${s.id}`,
        icon: <Palette className="h-4 w-4" />,
        label: `Skin: ${s.name}`,
        hint: s.nameJp,
        run: () => setSkin(s.id),
        score: scoreOf(q, `skin ${s.name} ${s.nameJp}`),
      })),
      { id: "bg:skin", icon: <Sparkles className="h-4 w-4" />, label: "Background: Skin Default", hint: "背景", run: () => setBgStyle("skin"), score: scoreOf(q, "background skin default 背景") },
      ...BG_STYLES.map((s) => ({
        id: `bg:${s.id}`,
        icon: <Sparkles className="h-4 w-4" />,
        label: `Background: ${s.name}`,
        hint: s.nameJp,
        run: () => setBgStyle(s.id),
        score: scoreOf(q, `background ${s.name} ${s.nameJp}`),
      })),
    ];
    for (const a of acts) if (a.score >= 0) out.push(a);

    // title/artist/album first, tags next, lyrics as fallback — a remembered
    // line or genre finds the song
    const t = (q
      ? tracks.filter(
          (tr) =>
            scoreOf(q, `${tr.title} ${tr.artist} ${tr.album}`) >= 0 ||
            scoreOf(q, tr.genre.join(" ")) >= 0 ||
            (tr.lyrics ? scoreOf(q, tr.lyrics) >= 0 : false),
        )
      : tracks
    )
      .slice(0, q ? 8 : 5)
      .map((tr: TrackMeta) => {
        const idx = tracks.findIndex((x) => x.id === tr.id);
        const meta = q ? scoreOf(q, `${tr.title} ${tr.artist} ${tr.album}`) : 5;
        const tag = q ? scoreOf(q, tr.genre.join(" ")) : -1;
        const lyr = q && tr.lyrics ? scoreOf(q, tr.lyrics) : -1;
        const byLyrics = lyr > meta && lyr > tag;
        const byTag = tag > meta && !byLyrics;
        return {
          id: `track:${tr.id}`,
          icon: <Disc3 className="h-4 w-4" />,
          label: tr.title,
          hint: byTag ? "TAG タグ" : byLyrics ? "歌詞 LYRICS" : `${tr.artist} — ${tr.album}`,
          run: () => {
            playQueue(tracks, Math.max(0, idx));
            setNowPlayingOpen(true);
          },
          score: q ? Math.max(meta, tag - 1, lyr > 0 ? lyr - 2 : -1) : 5,
        };
      });
    out.push(...t);
    return out.sort((a, b) => b.score - a.score).slice(0, 10);
  }, [query, tracks, navigate, setSkin, setBgStyle, setCalm, calm, toggle, playQueue, setNowPlayingOpen]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, items.length - 1)));
  }, [items.length]);

  if (!open) return null;

  const runAt = (i: number) => {
    const item = items[i];
    if (!item) return;
    setOpen(false);
    item.run();
  };

  return (
    <AnimatePresence>
      <motion.div
        key="palette"
        className="fixed inset-0 z-[70] flex items-start justify-center pt-[14vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onPointerDown={() => setOpen(false)}
      >
        <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ato-bg) 62%, transparent)" }} />
        <motion.div
          className="clip-notch relative w-[min(620px,92vw)] bg-panel backdrop-blur-xl"
          style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
          initial={{ y: -18, opacity: 0, skewX: -3 }}
          animate={{ y: 0, opacity: 1, skewX: 0 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: "var(--ato-accent)" }}>
              ▞ COMMAND
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => (c + 1) % Math.max(1, items.length));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => (c - 1 + items.length) % Math.max(1, items.length));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  runAt(cursor);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Search tracks, jump anywhere…"
              className="font-mono flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
            />
            <span className="font-mono text-[9px] tracking-[0.2em] text-dim">ESC</span>
          </div>
          <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-2">
            {items.map((item, i) => (
              <button
                key={item.id}
                onClick={() => runAt(i)}
                onMouseEnter={() => setCursor(i)}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left"
                style={{
                  background:
                    i === cursor ? "color-mix(in srgb, var(--ato-accent) 12%, transparent)" : undefined,
                  borderLeft: i === cursor ? "3px solid var(--ato-accent)" : "3px solid transparent",
                }}
              >
                <span style={{ color: i === cursor ? "var(--ato-accent)" : "var(--ato-text-dim)" }}>{item.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.label}</span>
                <span className="font-mono truncate text-[10px] text-dim">{item.hint}</span>
              </button>
            ))}
            {items.length === 0 && (
              <div className="px-5 py-6 text-center text-sm text-dim">No matches — 該当なし</div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
