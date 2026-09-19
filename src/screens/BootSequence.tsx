import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useUi } from "@/state/uiStore";
import { fx } from "@/fx/FxDirector";
import { getSkin } from "@/skins/registry";

// slanted bands backing the boot screen; static clip-paths, animated with
// transforms only so the exit stays on the compositor. The grid runs one band
// past each viewport edge — otherwise the slant leaves the top-left and
// bottom-right corners uncovered and the app shows through behind the overlay.
const SLICES = Array.from({ length: 8 }, (_, k) => {
  const s = 8; // % slant, echoes the brand slash
  const w = 100 / 6; // six bands across the viewport, plus one overhang per side
  const x0 = (k - 1) * w;
  const x1 = x0 + w;
  return `polygon(${x0 + s}% 0%, ${x1 + s}% 0%, ${x1 - s}% 100%, ${x0 - s}% 100%)`;
});

const RGB_OFF = "0px 0px 0px rgba(0,0,0,0), 0px 0px 0px rgba(0,0,0,0)";

/**
 * BootSequence — game-style launch set-piece:
 * slash line → logo assembles → system ticker → glitch jitter → the screen
 * splits into slanted slices that slide apart into the app.
 * Click anywhere to skip (jumps to the exit). Plays once per session.
 */
export function BootSequence({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const skin = getSkin(useUi.getState().skinId);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    let tl: gsap.core.Timeline | null = null;
    let disposed = false;

    function finish() {
      if (doneRef.current) return;
      doneRef.current = true;
      fx.impact(1.2);
      onDone();
    }

    const build = () => {
      if (disposed) return;
      // calm mode (reduced motion): static logo, quick fade, done
      if (useUi.getState().calm) {
        tl = gsap.timeline({ onComplete: finish }).to(el, { opacity: 0, duration: 0.3 }, 0.3);
        return;
      }
      tl = gsap.timeline({ onComplete: finish });
      // system ticker lines
      tl.fromTo(
        q(".boot-line"),
        { opacity: 0, x: -14 },
        { opacity: 1, x: 0, duration: 0.18, stagger: 0.1, ease: "power2.out" },
        0.05,
      )
        // slash line
        .fromTo(
          q(".boot-slash"),
          { scaleX: 0 },
          { scaleX: 1, duration: 0.45, ease: "expo.inOut", transformOrigin: "left center" },
          0.2,
        )
        // logo letters rise
        .fromTo(
          q(".boot-letter"),
          { yPercent: 118, skewX: -14 },
          { yPercent: 0, skewX: 0, duration: 0.6, ease: "expo.out", stagger: 0.05 },
          0.45,
        )
        // jp subtitle + tagline
        .fromTo(q(".boot-jp"), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, 0.95)
        .fromTo(
          q(".boot-tag"),
          { opacity: 0, letterSpacing: "0.9em" },
          { opacity: 1, letterSpacing: "0.32em", duration: 0.55, ease: "power2.out" },
          1.1,
        )
        // glitch jitter + rgb-split flicker, then the slices split apart
        .addLabel("reveal", 2.0)
        .set(q(".boot-letter"), { textShadow: RGB_OFF }, "reveal")
        .to(
          q(".boot-content"),
          {
            keyframes: [
              { x: -4, skewX: 2.5 },
              { x: 4, skewX: -3 },
              { x: -2, skewX: 1.5 },
              { x: 0, skewX: 0 },
            ],
            duration: 0.28,
            ease: "none",
          },
          "reveal",
        )
        .to(
          q(".boot-letter"),
          {
            keyframes: [
              { textShadow: "4px 0px 0px rgba(0,229,255,0.8), -4px 0px 0px rgba(255,42,109,0.8)" },
              { textShadow: "-4px 0px 0px rgba(255,42,109,0.8), 4px 0px 0px rgba(0,229,255,0.8)" },
              { textShadow: RGB_OFF },
            ],
            duration: 0.28,
            ease: "none",
          },
          "reveal",
        )
        .to(q(".boot-content"), { opacity: 0, duration: 0.3, ease: "power1.in" }, "reveal+=0.2")
        .to(
          q(".boot-slice"),
          {
            xPercent: (i: number) => (i % 2 === 0 ? 130 : -130),
            duration: 0.85,
            ease: "power4.inOut",
            stagger: { each: 0.09, from: "center" },
          },
          "reveal+=0.25",
        );
    };

    // GSAP's ticker runs on rAF, which freezes in hidden/throttled tabs —
    // the watchdog guarantees the boot still completes (and unblocks) there
    const watchdog = setTimeout(() => finish(), 4600);
    build();

    const skip = () => {
      if (doneRef.current) return;
      if (!tl) {
        finish();
        return;
      }
      // still in the intro: jump to the exit and let it play out
      if (tl.labels.reveal !== undefined && tl.time() < tl.labels.reveal) {
        tl.seek("reveal", false);
      } else {
        tl.kill();
        finish();
      }
    };
    el.addEventListener("pointerdown", skip);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      disposed = true;
      clearTimeout(watchdog);
      el.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", onKey);
      tl?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[100] cursor-pointer overflow-hidden">
      {/* slice backdrop: tiles the screen, slides apart on exit */}
      <div className="absolute inset-0" aria-hidden>
        {SLICES.map((clip, i) => (
          <div
            key={i}
            className="boot-slice absolute inset-0"
            style={{ clipPath: clip, background: "var(--ato-bg)", willChange: "transform" }}
          />
        ))}
      </div>

      <div className="boot-content absolute inset-0 flex flex-col items-center justify-center">
        {/* system ticker */}
        <div className="font-mono absolute top-8 left-8 flex flex-col gap-1 text-[10px] text-dim">
          <span className="boot-line">ATORI SYSTEM v0.2.0</span>
          <span className="boot-line">AUDIO GRAPH ......... OK</span>
          <span className="boot-line">SKIN ENGINE [{skin.name}] LOADED</span>
          <span className="boot-line">VISUALIZER .......... STANDBY</span>
        </div>
        <div className="font-mono absolute right-8 bottom-8 text-[10px] tracking-[0.3em] text-dim">
          CLICK TO SKIP
        </div>

        {/* logo */}
        <div className="relative flex flex-col items-center">
          <div className="boot-slash h-[2px] w-[min(70vw,560px)]" style={{ background: "var(--ato-accent)" }} />
          <div className="my-4 flex overflow-hidden">
            {"ATRI".split("").map((ch, i) => (
              <span
                key={i}
                className="boot-letter font-display text-[clamp(64px,14vw,160px)] leading-none font-bold"
                style={{
                  color: i % 2 === 1 ? "var(--ato-accent)" : "var(--ato-text)",
                  willChange: "transform",
                }}
              >
                {ch}
              </span>
            ))}
          </div>
          <div className="boot-jp font-jp text-lg tracking-[1.2em] text-dim" style={{ marginRight: "-1.2em" }}>
            アトリ
          </div>
          <div className="boot-tag font-mono mt-6 text-[11px] tracking-[0.32em] text-dim">
            MUSIC // VISUAL // EXPERIENCE
          </div>
        </div>
      </div>
    </div>
  );
}
