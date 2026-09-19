import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useSkin, currentSkin } from "@/skins/SkinProvider";
import { qualityDprCap, qualityScalar } from "@/skins/registry";
import { useUi } from "@/state/uiStore";
import { audioLevels } from "@/core/audio/AudioLevels";
import { fx } from "./FxDirector";
import { getBgStyle } from "./bgStyles";
import { VERT, buildFragment } from "./shaders";

/**
 * ShaderStage — one fullscreen WebGL canvas behind the whole app.
 * Renders the active skin's background shader with audio-reactive
 * uniforms. All mutation is imperative; React never re-renders per frame.
 */
export function ShaderStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skin = useSkin();
  const bgStyle = useUi((s) => s.bgStyle);
  const fxQuality = useUi((s) => s.fxQuality);
  const calm = useUi((s) => s.calm);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const uniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
  const calmRef = useRef(calm);
  calmRef.current = calm;

  // Mount: build the GL stage once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        powerPreference: "high-performance",
      });
    } catch {
      return; // no WebGL — page background color still carries the skin
    }
    rendererRef.current = renderer;

    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uLevel: { value: 0 },
      uImpact: { value: 0 },
      uWipe: { value: 0 },
      uA: { value: new THREE.Color("#ff2e88") },
      uB: { value: new THREE.Color("#00e5ff") },
      uC: { value: new THREE.Color("#0b0b12") },
      uGrain: { value: 0.05 },
      uScan: { value: 0.05 },
      uVig: { value: 0.42 },
      uQuality: { value: 0.85 },
      uCalm: { value: 0 },
    };
    uniformsRef.current = uniforms;

    // 32 FFT bands as a 1D texture; JS smooths attack/decay for fluid bars
    const bandData = new Uint8Array(32);
    const bandSmooth = new Float32Array(32);
    const bandsTex = new THREE.DataTexture(bandData, 32, 1, THREE.RedFormat);
    bandsTex.magFilter = THREE.LinearFilter;
    bandsTex.minFilter = THREE.LinearFilter;
    bandsTex.needsUpdate = true;
    uniforms.uBands = { value: bandsTex };

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: buildFragment(currentSkin().shader),
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    materialRef.current = material;
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      const pr = renderer.getPixelRatio();
      uniforms.uRes.value.set(w * pr, h * pr);
    };
    resize();
    window.addEventListener("resize", resize);

    let impact = 0;
    let wipe = 0;
    const offImpact = fx.onImpact((s) => {
      impact = Math.min(1.6, impact + s);
    });
    const offWipe = fx.onWipe((s) => {
      wipe = Math.max(wipe, s);
    });

    let raf = 0;
    let time = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!calmRef.current) time += dt;

      uniforms.uTime.value = time;
      uniforms.uBass.value = audioLevels.bass;
      uniforms.uMid.value = audioLevels.mid;
      uniforms.uTreble.value = audioLevels.treble;
      uniforms.uLevel.value = audioLevels.level;
      // fast attack / slow decay per band — fluid bars, no strobe
      for (let i = 0; i < 32; i++) {
        const v = audioLevels.bands[i] ?? 0;
        bandSmooth[i] = v > bandSmooth[i] ? v : Math.max(v, bandSmooth[i] - dt * 1.4);
        bandData[i] = Math.min(255, Math.round(bandSmooth[i] * 255));
      }
      bandsTex.needsUpdate = true;
      impact *= 0.88;
      wipe *= 0.94;
      uniforms.uImpact.value = impact;
      uniforms.uWipe.value = wipe;

      if (!document.hidden) renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      offImpact();
      offWipe();
      window.removeEventListener("resize", resize);
      material.dispose();
      bandsTex.dispose();
      scene.clear();
      renderer.dispose();
      rendererRef.current = null;
      materialRef.current = null;
      uniformsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Skin + background style → swap shader body, palette and post-fx recipe.
  // The style replaces only the BG body; colors and post recipe stay per-skin.
  useEffect(() => {
    const material = materialRef.current;
    const uniforms = uniformsRef.current;
    if (!material || !uniforms) return;
    const body = bgStyle === "skin" ? skin.shader.body : (getBgStyle(bgStyle)?.body ?? skin.shader.body);
    material.fragmentShader = buildFragment({ ...skin.shader, body });
    material.needsUpdate = true;
    (uniforms.uA.value as THREE.Color).set(skin.tokens["--ato-accent"]);
    (uniforms.uB.value as THREE.Color).set(skin.tokens["--ato-accent-2"]);
    (uniforms.uC.value as THREE.Color).set(skin.tokens["--ato-bg"]);
    uniforms.uGrain.value = skin.shader.grain;
    uniforms.uScan.value = skin.shader.scanlines;
    uniforms.uVig.value = skin.shader.vignette;
  }, [skin, bgStyle]);

  // FX quality → DPR cap + shader detail scalar.
  useEffect(() => {
    const renderer = rendererRef.current;
    const uniforms = uniformsRef.current;
    if (!renderer || !uniforms) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityDprCap(fxQuality)));
    uniforms.uQuality.value = qualityScalar(fxQuality);
    window.dispatchEvent(new Event("resize"));
  }, [fxQuality]);

  // Calm mode → freeze shader motion in GLSL-land too.
  useEffect(() => {
    const uniforms = uniformsRef.current;
    if (uniforms) uniforms.uCalm.value = calm ? 1 : 0;
  }, [calm]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 h-full w-full"
      style={{ zIndex: 0 }}
      aria-hidden
    />
  );
}
