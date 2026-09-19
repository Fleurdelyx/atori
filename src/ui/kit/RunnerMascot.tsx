import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { engine } from "@/core/audio/AudioEngine";
import { audioLevels } from "@/core/audio/AudioLevels";
import { usePlayback } from "@/core/audio/playbackStore";
import { useUi } from "@/state/uiStore";
import type { RunnerKind } from "@/state/uiStore";

/**
 * A tiny articulated silhouette that runs along a seek bar, riding the song's
 * progress. Both characters are hand-built jointed SVG rigs: two-segment legs
 * with knee/hock bends, elbow bends, head bob and tail/ponytail lag.
 * Cadence is constant — audio only modulates amplitudes (stride swing via
 * bass, body bob via monitor level), never velocity. Calm mode settles the
 * rig into a static neutral pose. Mounted inside a seek-bar container, feet
 * on the line.
 */

/** Constant run cadence (rad/s) — horizontal pace is progress-linked, never audio-coupled. */
const CADENCE: Record<Exclude<RunnerKind, "off">, number> = { cat: 9.5, girl: 11 };

function CatSvg() {
  // Dynamic gallop silhouette — single accent fill, far limbs slightly recessed
  return (
    <svg width={80} height={52} viewBox="0 0 80 52" aria-hidden>
      <ellipse cx={40} cy={49.4} rx={20} ry={1.7} fill="#000000" opacity={0.14} />
      <g fill="var(--ato-accent)">
        <g data-body>
          {/* tail — streams straight back with a lifted curl */}
          <g transform="translate(16,26)">
            <g data-limb="tail1">
              <path d="M0.5 -2.6 Q-8 -3.4 -11.5 0.2 Q-13.4 2.4 -11.8 3.2 Q-10 3.8 -8.6 2.2 Q-5 -1 0.9 0.8 Z" />
              <g transform="translate(-11.4,1.2)">
                <g data-limb="tail2">
                  <path d="M0.2 -1.4 Q-3 -1.6 -4.4 0.8 Q-5.4 2.8 -3.6 3.6 Q-2 4.2 -1.2 2.6 Q-0.4 0.6 0.9 1.2 Z" />
                </g>
              </g>
            </g>
          </g>
          {/* far legs — extended in the gallop stretch */}
          <g transform="translate(24,30)" opacity={0.75}>
            <g data-limb="rt2">
              <path d="M-1.6 0 Q-1.9 4.6 -4.4 8.6 L-6.6 12.6 Q-7.3 14 -6 14.1 L-4.4 14 Q-5.2 11.6 -3.4 8.8 Q-0.4 4.8 1.4 0.4 Z" />
              <g transform="translate(-4.2,11.2)">
                <g data-limb="rc2">
                  <path d="M-0.9 -0.4 Q-2.6 1.4 -2.4 3.2 L-1.6 3.1 Q-0.6 1.8 0.8 0.4 Z" />
                </g>
              </g>
            </g>
          </g>
          <g transform="translate(52,28)" opacity={0.75}>
            <g data-limb="ft2">
              <path d="M-1.4 -0.4 Q0.8 4.4 4.4 8.4 L6.8 11.4 Q7.7 12.6 6.4 13 L4.8 13.1 Q5.4 10.8 3.2 8.2 Q0.4 4.8 -1.5 0.2 Z" />
              <g transform="translate(5.6,10)">
                <g data-limb="fc2">
                  <path d="M-0.5 -0.4 Q0.9 0.8 0.7 2.6 L-0.7 2.5 Q-1.1 1 -1.2 0.2 Z" />
                </g>
              </g>
            </g>
          </g>
          {/* arched leaping body */}
          <path d="M16 24 Q18.5 17.6 27 16.6 L44 14.8 Q53.5 14 56.5 21.5 Q58 25.5 55.5 28.5 Q51 33.5 42 34.6 L26 36.4 Q18 37.2 15.5 32 Q14 28.6 16 24 Z" />
          {/* head — swept ears, muzzle, charging forward */}
          <g data-limb="hd">
            <path d="M56.5 9.4 L60.4 15.6 L52.6 13.4 Z" />
            <path d="M63.6 7.2 L66.2 14 L58.9 13.2 Z" />
            <circle cx={60.5} cy={19.5} r={7.3} />
            <path d="M55.8 20.4 Q54.4 18.8 52.4 19.6 L46.8 16.4 Q52.8 12.6 58.8 13.6 Q63.5 14.6 66.4 18.4 Q69 21.8 68.4 24.6 Q67 22.2 63.4 22.4 Q66.8 20.8 63.4 19.4 Q60.4 18.2 58.4 20.6 Q57 19.2 55.8 20.4 Z" />
            <path d="M65.8 22.6 Q68.6 21.6 69.3 24 Q66.4 25.8 64.4 24.2 Z" />
          </g>
          {/* near legs */}
          <g transform="translate(23,30)">
            <g data-limb="rt1">
              <path d="M-1.7 0 Q-2.2 5.2 -5.2 9.6 L-8 14.2 Q-8.9 15.7 -7.5 15.8 L-5.8 15.7 Q-6.8 13.2 -4.6 10 Q-1 4.9 1.6 0.4 Z" />
              <g transform="translate(-6.4,13)">
                <g data-limb="rc1">
                  <path d="M-1 -0.5 Q-3.2 1.6 -2.9 3.6 L-1.8 3.5 Q-0.7 1.9 1 0.4 Z" />
                </g>
              </g>
            </g>
          </g>
          <g transform="translate(51,28)">
            <g data-limb="ft1">
              <path d="M-1.5 -0.5 Q1.2 4.6 5.2 8.6 L8.2 11.8 Q9.2 13 7.8 13.5 L6 13.6 Q6.8 11.2 4.2 8.4 Q0.8 4.8 -1.6 0.1 Z" />
              <g transform="translate(6.8,10.4)">
                <g data-limb="fc1">
                  <path d="M-0.6 -0.5 Q1.2 0.7 1 2.6 L-0.8 2.5 Q-1.2 1 -1.4 0.1 Z" />
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

function GirlSvg() {
  // Dynamic silhouette runner — flowing twin-tails, deep forward lean, skirt flare
  return (
    <svg width={64} height={84} viewBox="0 0 64 84" aria-hidden>
      <ellipse cx={32} cy={81.4} rx={14} ry={1.7} fill="#000000" opacity={0.14} />
      <g fill="var(--ato-accent)">
        <g data-body>
          {/* far arm — extended back-down */}
          <g transform="translate(35,42)" opacity={0.75}>
            <g data-limb="a2">
              <path d="M-1.7 -0.4 Q-5.4 1.6 -8.2 4.8 L-11.6 8.8 Q-12.6 10.1 -11.3 10.6 L-9.7 11 Q-10.1 9.4 -7.6 6.6 Q-4.2 2.8 -0.9 1.4 Z" />
              <g transform="translate(-10.9,9.3)">
                <g data-limb="fa2">
                  <path d="M-0.8 -0.6 Q-3.2 0.6 -4.4 3.2 L-5.1 5.2 Q-5.5 6.5 -4.3 6.4 Q-3.3 6.3 -3 4.9 Q-2.2 2.2 0.5 1 Z" />
                </g>
              </g>
            </g>
          </g>
          {/* far leg — trailing, toe pointed */}
          <g transform="translate(28,60)" opacity={0.75}>
            <g data-limb="l2">
              <path d="M-1.9 -0.6 Q-5.6 3.6 -9.4 8.4 Q-11.4 10.9 -10.4 11.7 Q-9.5 12.3 -8 10.6 Q-4.4 6.4 0.9 2.4 Z" />
              <g transform="translate(-9.8,10.4)">
                <g data-limb="c2">
                  <path d="M0.2 -0.8 Q-4.4 3.4 -8.2 8.6 Q-10.6 11.9 -9.5 12.8 Q-8.6 13.5 -7.2 11.9 Q-3 6.8 1.5 2 Z" />
                </g>
              </g>
            </g>
          </g>
          {/* torso — deep forward lean from the waist */}
          <g transform="translate(31,59)">
            <g data-limb="torso">
              {/* twin-tails — ribbon masses with pointed strand splits, lag on both */}
              <g transform="translate(7,-32)">
                <g data-limb="pt1">
                  <path d="M1 -1.6 Q-6.8 -3.4 -13 -1.4 L-21.6 -7.6 L-14.8 -2.8 L-19 -1.8 L-12.6 1.4 Q-6 3.4 1.4 2 Z" />
                  <g transform="translate(-2.4,1.6)">
                    <g data-limb="pt2">
                      <path d="M0.6 -0.8 Q-5.4 -0.2 -9.6 1.8 L-15.4 4.8 Q-11.8 6.4 -8.2 4.6 Q-4 6.6 0.8 3.4 Z" />
                    </g>
                  </g>
                </g>
              </g>
              {/* torso mass: neck wedge, chest curve down to the hip */}
              <path d="M4.6 -19.6 L9.6 -22.6 L10.4 -20 L2.2 -21.4 Q8.6 -20.8 10.8 -15.8 Q13 -10.4 10.6 -5.4 Q8.6 -1.6 4.4 -0.4 L-3.4 0.4 Q-1.8 -9.4 -0.2 -14.6 Q1.2 -18.8 2.2 -21.4 Z" />
              {/* head — profile silhouette with nose, ahoge wisps */}
              <g data-limb="hd">
                <path d="M10.4 -31.8 Q12.4 -34.8 15.6 -35.4 Q13.8 -33.6 13.6 -31.4 Z" />
                <path d="M8.8 -33.2 Q9.6 -36.4 12.6 -37.6 Q10.6 -35.2 11.2 -32.6 Z" />
                <circle cx={13.5} cy={-24} r={8} />
                <path d="M20.4 -27.2 Q22.8 -25.6 21.8 -22.4 Q21.2 -20.6 18.8 -20.4 Q20.4 -23.4 18.4 -25.6 Z" />
                <path d="M11.2 -31.4 Q15.6 -33.4 19.8 -31.6 Q17.4 -29.8 11.6 -30.2 Z" />
              </g>
            </g>
          </g>
          {/* skirt — pleated flare whipping back */}
          <g transform="translate(30,58)">
            <g data-limb="skirt">
              <path d="M1.4 -2.6 Q-2.2 -2.4 -7.8 -0.6 L-11.4 9.6 Q-8.6 6.4 -7.4 8.8 Q-5.8 5.6 -4 7.6 Q-2.4 5.8 -0.4 7.2 Q1.2 -2.6 7.4 -1.4 Q5 -0.4 1.4 -2.6 Z" />
            </g>
          </g>
          {/* near leg — knee drive */}
          <g transform="translate(33,60)">
            <g data-limb="l1">
              <path d="M-1.9 -0.6 Q6.2 -1.2 12.8 2.6 L11.4 5.4 Q5.4 2.6 -1.4 3.4 Z" />
              <g transform="translate(12.4,4.2)">
                <g data-limb="c1">
                  <path d="M-1.4 -0.4 Q-0.4 7 -1.2 13.8 L1.4 14.6 Q3.4 7 1.9 -0.6 Z" />
                  <path d="M-1.5 13.6 L1.6 14.4 Q4.4 14.6 5.9 16.6 Q6.6 17.6 5.3 17.9 L-1.9 16.4 Q-2.7 15 -1.5 13.6 Z" />
                </g>
              </g>
            </g>
          </g>
          {/* near arm — fist pumped forward */}
          <g transform="translate(38,41)">
            <g data-limb="a1">
              <path d="M-1.6 -0.8 Q3.6 1.4 7.6 5.6 L6 7.6 Q1.4 3.4 -2.2 1.4 Z" />
              <g transform="translate(6.8,6.6)">
                <g data-limb="fa1">
                  <path d="M0.9 -1 Q3.4 1.8 2.6 5.6 Q2.1 7.9 0.4 7.4 Q-1.1 6.9 -0.4 4.6 Q0.5 1.9 -1.6 -0.4 Z" />
                  <circle cx={-0.4} cy={8.2} r={1.9} />
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

export function RunnerMascot({
  kind,
  laneRef,
  feet = "top",
}: {
  kind: Exclude<RunnerKind, "off">;
  laneRef: RefObject<HTMLElement | null>;
  /** where the bar's line sits inside the lane element: top edge or vertical center */
  feet?: "top" | "center";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isPlaying = usePlayback((s) => s.isPlaying);
  const calm = useUi((s) => s.calm);
  const activeRef = useRef(false);
  activeRef.current = isPlaying && !calm;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const limbs: Record<string, SVGGElement> = {};
    root.querySelectorAll<SVGGElement>("[data-limb]").forEach((el) => {
      if (el.dataset.limb) limbs[el.dataset.limb] = el;
    });
    const body = root.querySelector<SVGGElement>("[data-body]");

    const rot = (name: string, deg: number) => {
      limbs[name]?.setAttribute("transform", `rotate(${deg.toFixed(2)})`);
    };

    let raf = 0;
    let phase = 0;
    let env = 0; // eases 0↔1 with play state; scales every amplitude
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // ride the song's progress along the lane (meta duration until audio is loaded)
      const lane = laneRef.current;
      if (lane) {
        const d = engine.el.duration || usePlayback.getState().duration || 0;
        const t = engine.el.duration ? engine.el.currentTime : usePlayback.getState().position;
        const p = d > 0 ? Math.min(1, t / d) : 0;
        const x = p * Math.max(0, lane.clientWidth - root.offsetWidth);
        root.style.transform = `translate(${x.toFixed(1)}px, ${feet === "center" ? "-50%" : "-100%"})`;
      }

      env += ((activeRef.current ? 1 : 0) - env) * Math.min(1, dt * 6);
      if (env > 0.001 && activeRef.current) phase += dt * CADENCE[kind];

      const bass = audioLevels.bass;
      const lv = audioLevels.level;
      const bob = env * (0.5 - 0.5 * Math.cos(2 * phase)); // two bounces per stride

      if (kind === "cat") {
        const A = env * (0.5 + bass * 0.25); // stride swing
        const K = env * (0.55 + bass * 0.3); // hock bend
        const s = (o: number) => Math.sin(phase + o);
        // gallop: rear pair leads, front pair follows; calves fold on the lift
        rot("rt1", A * s(0));
        rot("rt2", A * s(0.45));
        rot("ft1", A * s(2.9));
        rot("ft2", A * s(3.35));
        rot("rc1", -K * Math.max(0, s(1.1)));
        rot("rc2", -K * Math.max(0, s(1.55)));
        rot("fc1", -K * Math.max(0, s(4.0)));
        rot("fc2", -K * Math.max(0, s(4.45)));
        rot("tail1", env * (0.22 + bass * 0.15) * s(1.1));
        rot("tail2", env * (0.34 + bass * 0.2) * s(0.5));
        limbs.hd?.setAttribute(
          "transform",
          `translate(0 ${(env * (1.4 + lv * 2.4) * s(2 * phase + 0.7)).toFixed(2)}) rotate(${(env * 4 * s(phase + 1.1)).toFixed(2)} 60.5 19.5)`,
        );
        body?.setAttribute(
          "transform",
          `translate(0 ${(-(bob * (1 + lv * 3))).toFixed(2)}) rotate(${(env * 2.2 * s(phase)).toFixed(2)} 36 27)`,
        );
      } else {
        const p1 = phase;
        const p2 = phase + Math.PI;
        const LS = env * (0.62 + bass * 0.28); // leg swing
        const KB = env * (0.65 + bass * 0.25); // knee bend
        const AS = env * (0.5 + bass * 0.2); // arm swing
        const EB = env * (0.85 + bass * 0.25); // elbow bend
        const s = (o: number) => Math.sin(phase + o);
        rot("l1", LS * Math.sin(p1));
        rot("l2", LS * Math.sin(p2));
        rot("c1", KB * Math.max(0, -Math.cos(p1)));
        rot("c2", KB * Math.max(0, -Math.cos(p2)));
        rot("a1", AS * Math.sin(p2 + 0.3));
        rot("a2", AS * Math.sin(p1 + 0.3));
        rot("fa1", EB * Math.max(0, Math.sin(p2 + 1.3)));
        rot("fa2", EB * Math.max(0, Math.sin(p1 + 1.3)));
        rot("pt1", env * 0.3 * s(0.7));
        rot("pt2", env * 0.45 * s(0.15));
        rot("skirt", env * 3.5 * s(0.4));
        rot("torso", env * (-4 - 2.2 * s(0)));
        limbs.hd?.setAttribute(
          "transform",
          `rotate(${(env * 2.5 * s(1)).toFixed(2)} 13.5 -24)`,
        );
        body?.setAttribute("transform", `translate(0 ${(-(bob * (1.6 + lv * 3.6))).toFixed(2)})`);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [kind, laneRef, feet]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute top-0 left-0 z-20"
      style={{ transform: `translate(0, ${feet === "center" ? "-50%" : "-100%"})` }}
    >
      {kind === "cat" ? <CatSvg /> : <GirlSvg />}
    </div>
  );
}
