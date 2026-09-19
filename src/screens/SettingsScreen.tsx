import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Cloud, Shield } from "lucide-react";
import { useUi } from "@/state/uiStore";
import { SKINS, EQ_APPLIED_LABEL } from "@/skins/registry";
import { useSkin } from "@/skins/SkinProvider";
import { engine, EQ_FREQS } from "@/core/audio/AudioEngine";
import { fx } from "@/fx/FxDirector";
import type { FxQuality } from "@/skins/types";
import { testConnection, normalizeCloudUrl } from "@/core/cloud/cloudService";
import { useCloud } from "@/core/cloud/cloudStore";
import { useAuth } from "@/core/auth/authStore";
import { logout } from "@/core/auth/authService";
import { clearCoverCache } from "@/core/library/coverCache";
import { toast } from "@/state/toastStore";
import { BG_STYLES } from "@/fx/bgStyles";
import { useAllTracks } from "@/core/library/useLibrary";
import { findDuplicates } from "@/core/library/duplicates";
import { buildBackup, downloadBackup, restoreBackup } from "@/core/library/backup";
import { db } from "@/core/library/db";

const QUALITIES: FxQuality[] = ["ultra", "high", "medium", "low"];

const EQ_PRESETS: { id: string; name: string; jp: string; gains: number[] }[] = [
  { id: "flat", name: "FLAT", jp: "フラット", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "bass", name: "BASS", jp: "重低音", gains: [7, 7, 6, 4, 2, 0, 0, 0, 0, 0] },
  { id: "vocal", name: "VOCAL", jp: "ボーカル", gains: [-2, -1, 2, 4, 4, 4, 2, 0, -1, -2] },
  { id: "treble", name: "TREBLE", jp: "高音", gains: [0, 0, 0, 1, 2, 3, 5, 6, 6, 7] },
];

const SLEEP_CHOICES = [15, 30, 45, 60];

export function SectionHeader({ title, jp }: { title: string; jp: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <h2 className="font-display text-sm font-bold tracking-[0.3em]">{title}</h2>
      <span className="font-jp text-[10px] tracking-[0.3em] text-dim">{jp}</span>
      <span className="h-px flex-1" style={{ background: "var(--ato-border)" }} />
    </div>
  );
}

/** live remaining time for the sleep timer (mm:ss), re-renders once a second */
function SleepCountdown({ endsAt }: { endsAt: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, endsAt - Date.now());
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  return (
    <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: "var(--ato-accent-2)" }}>
      {mm}:{String(ss).padStart(2, "0")}
    </span>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {  return (
    <button onClick={() => onChange(!on)} className="flex items-center gap-3">
      <span
        className="relative h-5 w-10 transition-colors duration-200"
        style={{
          clipPath: "polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)",
          background: on ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 14%, transparent)",
        }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 bg-white transition-all duration-200"
          style={{
            left: on ? "calc(100% - 18px)" : "2px",
            // slanted knob riding the shell's parallelogram angle
            clipPath: "polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)",
          }}
        />
      </span>
      <span className="text-xs text-dim">{label}</span>
    </button>
  );
}

/** ACCOUNT — sign in / register on an atori-cloud worker (accounts mode). */
function CloudAccountSection() {
  const serverUrl = useAuth((s) => s.serverUrl);
  const setServerUrl = useAuth((s) => s.setServerUrl);
  const user = useAuth((s) => s.user);
  const sessionExpired = useAuth((s) => s.sessionExpired);
  const setAuthOpen = useAuth((s) => s.setAuthOpen);
  const setAuthMode = useAuth((s) => s.setAuthMode);

  const signOut = async () => {
    const a = useAuth.getState();
    if (a.sessionToken) await logout(a.serverUrl, a.sessionToken);
    a.setSession(null, null);
    a.setSessionExpired(false);
    useCloud.setState({ manifest: null, status: "idle", error: null });
    clearCoverCache();
    toast("Signed out", "success", "サインアウト");
  };

  const urlOk = normalizeCloudUrl(serverUrl) !== null;

  return (
    <div className="clip-notch bg-panel p-5 backdrop-blur-md" style={{ border: "1px solid var(--ato-border)" }}>
      <div className="mb-4 flex items-center gap-3">
        <Cloud className="h-5 w-5" style={{ color: user ? "var(--ato-accent-2)" : "var(--ato-text-dim)" }} />
        <div>
          <div className="text-sm font-semibold">ACCOUNT アカウント</div>
          <div className="font-mono text-[9px] tracking-[0.2em] text-dim">
            HOST YOUR LIBRARY — STREAM IT ON ANY DEVICE
          </div>
        </div>
      </div>

      {user ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="font-mono truncate text-[10px] text-dim">{user.email}</div>
          </div>
          <button
            onClick={() => void signOut()}
            className="clip-tag font-mono px-5 py-2 text-[10px] font-bold tracking-[0.3em]"
            style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)", color: "var(--ato-text-dim)" }}
          >
            SIGN OUT
          </button>
        </div>
      ) : (
        <>
          <label className="mb-3 block">
            <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">SERVER URL</span>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://atori-cloud.<you>.workers.dev"
              className="font-mono w-full bg-transparent px-3 py-2 text-xs outline-none"
              style={{ border: "1px solid var(--ato-border)" }}
            />
          </label>
          {sessionExpired && (
            <p className="font-mono mb-3 text-[10px] tracking-[0.15em]" style={{ color: "var(--ato-danger)" }}>
              SESSION EXPIRED — SIGN IN AGAIN
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setAuthMode("login");
                setAuthOpen(true);
              }}
              disabled={!urlOk}
              className="clip-tag px-5 py-2 disabled:opacity-40"
              style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
            >
              <span className="font-mono text-[10px] font-bold tracking-[0.3em]">SIGN IN</span>
            </button>
            <button
              onClick={() => {
                setAuthMode("register");
                setAuthOpen(true);
              }}
              disabled={!urlOk}
              className="clip-tag px-5 py-2 disabled:opacity-40"
              style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)", color: "var(--ato-text-dim)" }}
            >
              <span className="font-mono text-[10px] font-bold tracking-[0.3em]">CREATE ACCOUNT</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** atori-cloud worker connection config + status. */
function CloudSection() {
  const cloudUrl = useUi((s) => s.cloudUrl);
  const cloudToken = useUi((s) => s.cloudToken);
  const setCloud = useUi((s) => s.setCloud);
  const refresh = useCloud((s) => s.refresh);
  const [url, setUrl] = useState(cloudUrl);
  const [token, setToken] = useState(cloudToken);
  const [state, setState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [message, setMessage] = useState("");

  const connect = async () => {
    setState("testing");
    const r = await testConnection(url.trim(), token.trim());
    setState(r.ok ? "ok" : "fail");
    setMessage(r.message);
    if (r.ok) {
      setCloud(url.trim(), token.trim());
      void refresh();
    }
  };

  const connected = state === "ok";
  return (
    <div className="clip-notch bg-panel p-5 backdrop-blur-md" style={{ border: "1px solid var(--ato-border)" }}>
        <div className="mb-4 flex items-center gap-3">
          <Cloud className="h-5 w-5" style={{ color: connected ? "var(--ato-accent-2)" : "var(--ato-text-dim)" }} />
          <div>
            <div className="text-sm font-semibold">LEGACY — SHARED TOKEN (SELF-HOST)</div>
            <div className="font-mono text-[9px] tracking-[0.2em] text-dim">
              NO ACCOUNTS — ONE TOKEN FOR THE WHOLE BUCKET
            </div>
          </div>
        </div>
      <label className="mb-3 block">
        <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">ENDPOINT URL</span>
        <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setState("idle");
              }}
              placeholder="http://localhost:8787 (dev)"
          className="font-mono w-full bg-transparent px-3 py-2 text-xs outline-none"
          style={{ border: "1px solid var(--ato-border)" }}
        />
      </label>
      <label className="mb-4 block">
        <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">AUTH TOKEN</span>
        <input
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setState("idle");
          }}
          type="password"
          placeholder="AUTH_TOKEN secret"
          className="font-mono w-full bg-transparent px-3 py-2 text-xs outline-none"
          style={{ border: "1px solid var(--ato-border)" }}
        />
      </label>
      <div className="flex items-center gap-4">
        <button
          onClick={() => void connect()}
          disabled={!url.trim() || !token.trim() || state === "testing"}
          className="clip-tag font-mono px-5 py-2 text-[10px] font-bold tracking-[0.3em] disabled:opacity-40"
          style={{
            background: connected ? "var(--ato-accent-2)" : "var(--ato-accent)",
            color: connected ? "#06121a" : "var(--ato-bg)",
          }}
        >
          {state === "testing" ? "CONNECTING…" : connected ? "CONNECTED ✓" : "CONNECT"}
        </button>
        {message && (
          <span
            className="font-mono text-[10px] tracking-[0.2em]"
            style={{ color: connected ? "var(--ato-accent-2)" : "var(--ato-danger)" }}
          >
            {message}
          </span>
        )}
      </div>
      <p className="font-mono mt-4 text-[9px] leading-relaxed tracking-[0.1em] text-dim">
        STREAM REQUESTS PASS THE TOKEN AS A QUERY PARAM (MEDIA ELEMENTS CANNOT SEND HEADERS).
        KEEP YOUR WORKER URL UNLISTED AND ROTATE THE TOKEN IF IT LEAKS.
      </p>
    </div>
  );
}

export function SettingsScreen() {
  const skinId = useUi((s) => s.skinId);
  const setSkin = useUi((s) => s.setSkin);
  const bgStyle = useUi((s) => s.bgStyle);
  const setBgStyle = useUi((s) => s.setBgStyle);
  const fxQuality = useUi((s) => s.fxQuality);
  const setFxQuality = useUi((s) => s.setFxQuality);
  const calm = useUi((s) => s.calm);
  const setCalm = useUi((s) => s.setCalm);
  const eqEnabled = useUi((s) => s.eqEnabled);
  const setEqEnabled = useUi((s) => s.setEqEnabled);
  const eq = useUi((s) => s.eq);
  const setEq = useUi((s) => s.setEq);
  const fade = useUi((s) => s.fade);
  const setFade = useUi((s) => s.setFade);
  const crossfadeSeconds = useUi((s) => s.crossfadeSeconds);
  const setCrossfadeSeconds = useUi((s) => s.setCrossfadeSeconds);
  const autoplay = useUi((s) => s.autoplay);
  const setAutoplay = useUi((s) => s.setAutoplay);
  const smartVolume = useUi((s) => s.smartVolume);
  const setSmartVolume = useUi((s) => s.setSmartVolume);
  const sleepEndsAt = useUi((s) => s.sleepEndsAt);
  const setSleepEndsAt = useUi((s) => s.setSleepEndsAt);
  const skin = useSkin();
  const dataFileRef = useRef<HTMLInputElement>(null);

  // push EQ to the engine whenever it changes
  useEffect(() => {
    engine.setEq(eqEnabled, eq);
  }, [eqEnabled, eq]);

  // push fade/crossfade prefs to the engine
  useEffect(() => {
    engine.setFade(fade);
    engine.setCrossfadeSeconds(crossfadeSeconds);
  }, [fade, crossfadeSeconds]);

  // push smart volume to the engine
  useEffect(() => {
    engine.setSmartVolume(smartVolume);
  }, [smartVolume]);

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto px-8 py-7">
      <header className="mb-8">
        <div className="font-mono text-[10px] tracking-[0.35em] text-dim">SYSTEM CONFIG</div>
        <h1 className="font-display mt-1 text-3xl font-bold tracking-wide">
          SETTINGS <span className="font-jp text-lg text-dim">設定</span>
        </h1>
      </header>

      {/* appearance / skins */}
      <section className="mb-10">
        <SectionHeader title="APPEARANCE" jp="スキン" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SKINS.map((s) => {
            const active = s.id === skinId;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSkin(s.id);
                  fx.wipe(1);
                }}
                className="clip-notch relative overflow-hidden p-4 text-left backdrop-blur-md"
                style={{
                  background: "var(--ato-panel)",
                  border: active
                    ? "1px solid var(--ato-accent)"
                    : "1px solid var(--ato-border)",
                  boxShadow: active
                    ? "0 0 24px color-mix(in srgb, var(--ato-accent) 30%, transparent)"
                    : undefined,
                }}
              >
                <div className="h-14 w-full" style={{ background: s.swatch, borderRadius: "var(--ato-radius)" }} />
                <div className="font-display mt-3 text-sm font-bold tracking-widest">{s.name}</div>
                <div className="font-jp text-[10px] text-dim">{s.nameJp}</div>
                <div className="font-mono mt-1 text-[9px] tracking-wider text-dim">{s.tagline}</div>
                {active && (
                  <Check
                    className="absolute top-3 right-3 h-4 w-4"
                    style={{ color: "var(--ato-accent)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <p className="font-mono mt-3 text-[9px] tracking-[0.2em] text-dim">
          ACTIVE: {skin.name} — {skin.tagline.toUpperCase()}
        </p>
      </section>

      {/* visual fx */}
      <section className="mb-10">
        <SectionHeader title="VISUAL FX" jp="演出" />
        <div className="clip-notch bg-panel p-5 backdrop-blur-md" style={{ border: "1px solid var(--ato-border)" }}>
          {/* background animation style */}
          <div className="mb-5">
            <div className="font-mono mb-2 text-[9px] tracking-[0.3em] text-dim">BACKGROUND 背景</div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "skin", name: "SKIN DEFAULT" },
                ...BG_STYLES.map((s) => ({ id: s.id, name: s.name })),
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setBgStyle(s.id);
                    fx.wipe(1);
                  }}
                  className="clip-tag px-4 py-2"
                  style={{
                    background:
                      bgStyle === s.id ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                    color: bgStyle === s.id ? "var(--ato-bg)" : "var(--ato-text-dim)",
                  }}
                >
                  <span className="font-mono text-[10px] font-bold tracking-[0.2em]">{s.name}</span>
                </button>
              ))}
            </div>
            <p className="font-mono mt-2 text-[9px] tracking-[0.2em] text-dim">
              {bgStyle === "skin"
                ? "EACH SKIN CARRIES ITS OWN SCENE"
                : (BG_STYLES.find((s) => s.id === bgStyle)?.blurb ?? "").toUpperCase()}
              {" — TINTED BY THE ACTIVE SKIN"}
            </p>
          </div>

          <div className="mb-4 flex gap-2">
            {QUALITIES.map((q) => (
              <button
                key={q}
                onClick={() => setFxQuality(q)}
                className="clip-tag px-4 py-2"
                style={{
                  background:
                    fxQuality === q ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                  color: fxQuality === q ? "var(--ato-bg)" : "var(--ato-text-dim)",
                }}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.2em]">{q.toUpperCase()}</span>
              </button>
            ))}
          </div>
          <p className="font-mono mb-5 text-[9px] tracking-[0.2em] text-dim">
            SHADER DETAIL / RESOLUTION SCALER — LOWER IF YOUR GPU STRUGGLES
          </p>
          <Toggle on={calm} onChange={setCalm} label="CALM MODE — freeze ambient motion (respects prefers-reduced-motion)" />
        </div>
      </section>

      {/* audio */}
      <section className="mb-10">
        <SectionHeader title="AUDIO" jp="音響" />
        <div className="clip-notch bg-panel p-5 backdrop-blur-md" style={{ border: "1px solid var(--ato-border)" }}>
          <div className="mb-5">
            <Toggle on={eqEnabled} onChange={setEqEnabled} label="10-BAND EQUALIZER" />
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] tracking-[0.3em] text-dim">PRESET</span>
            {EQ_PRESETS.map((p) => {
              const active = eqEnabled && eq.every((g, i) => g === p.gains[i]);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setEqEnabled(true);
                    setEq(p.gains);
                  }}
                  className="clip-tag px-3 py-1 transition-colors"
                  style={{
                    background: active ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                    color: active ? "var(--ato-bg)" : "var(--ato-text-dim)",
                  }}
                >
                  <span className="font-mono text-[9px] font-bold tracking-[0.2em]">{p.name}</span>
                  <span className="font-jp ml-2 text-[8px] opacity-70">{p.jp}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-5 gap-x-6 gap-y-4 opacity-100 transition-opacity" style={{ opacity: eqEnabled ? 1 : 0.4 }}>
            {EQ_FREQS.map((f, i) => (
              <label key={f} className="flex flex-col items-center gap-1">
                <span className="font-mono text-[9px] text-dim">
                  {f >= 1000 ? `${f / 1000}k` : f}
                </span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={eq[i]}
                  disabled={!eqEnabled}
                  onChange={(e) => {
                    const next = [...eq];
                    next[i] = parseFloat(e.target.value);
                    setEq(next);
                  }}
                  className="eq-slider w-full"
                  style={{ "--fill": `${((eq[i] + 12) / 24) * 100}%` } as React.CSSProperties}
                />
                <span className="font-mono text-[9px]" style={{ color: "var(--ato-accent-2)" }}>
                  {eq[i] > 0 ? `+${eq[i]}` : eq[i]}
                </span>
              </label>
            ))}
          </div>
          <p className="font-mono mt-2 text-[9px] tracking-[0.15em] text-dim">
            {EQ_APPLIED_LABEL}
          </p>
          <div className="mt-5 border-t border-line pt-4">
            <Toggle on={fade} onChange={setFade} label="AUTO FADE — smooth fades on play/pause and track ends" />
            <div className="mt-4">
              <div className="font-mono mb-2 flex items-center justify-between text-[9px] tracking-[0.3em] text-dim">
                <span>CROSSFADE クロスフェード</span>
                <span style={{ color: "var(--ato-accent-2)" }}>
                  {crossfadeSeconds === 0 ? "OFF" : `${crossfadeSeconds.toFixed(1)}s`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={12}
                step={0.5}
                value={crossfadeSeconds}
                onChange={(e) => setCrossfadeSeconds(parseFloat(e.target.value))}
                className="ato-slider w-full cursor-pointer"
                style={{ "--fill": `${(crossfadeSeconds / 12) * 100}%` } as React.CSSProperties}
              />
            </div>
            <div className="mt-4">
              <Toggle on={autoplay} onChange={setAutoplay} label="AUTOPLAY — keep playing similar tracks when the queue ends" />
            </div>
            <div className="mt-4">
              <Toggle on={smartVolume} onChange={setSmartVolume} label="SMART VOLUME — learn each track's loudness and level playback" />
              <p className="font-mono mt-1 text-[9px] tracking-[0.15em] text-dim">
                LEARNS A FEW SECONDS INTO EACH TRACK — STORED PER TRACK, APPLIED ON PLAY
              </p>
            </div>
            <div className="mt-4">
              <div className="font-mono mb-2 text-[9px] tracking-[0.3em] text-dim">SLEEP タイマー</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSleepEndsAt(null)}
                  className="clip-tag px-3 py-1.5 transition-colors"
                  style={{
                    background:
                      sleepEndsAt === null ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                    color: sleepEndsAt === null ? "var(--ato-bg)" : "var(--ato-text-dim)",
                  }}
                >
                  <span className="font-mono text-[10px] font-bold tracking-[0.2em]">OFF</span>
                </button>
                {SLEEP_CHOICES.map((m) => {
                  const active = sleepEndsAt !== null && sleepEndsAt - Date.now() > (m - 1) * 60000 && sleepEndsAt - Date.now() <= m * 60000;
                  return (
                    <button
                      key={m}
                      onClick={() => setSleepEndsAt(Date.now() + m * 60000)}
                      className="clip-tag px-3 py-1.5 transition-colors"
                      style={{
                        background: active ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                        color: active ? "var(--ato-bg)" : "var(--ato-text-dim)",
                      }}
                    >
                      <span className="font-mono text-[10px] font-bold tracking-[0.2em]">{m}M</span>
                    </button>
                  );
                })}
                {sleepEndsAt !== null && (
                  <SleepCountdown endsAt={sleepEndsAt} />
                )}
              </div>
              <p className="font-mono mt-2 text-[9px] tracking-[0.2em] text-dim">
                FADES OUT AND PAUSES WHEN THE TIMER HITS ZERO
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* cloud */}
      <section className="mb-10">
        <SectionHeader title="CLOUD" jp="クラウド" />
        <div className="mb-4">
          <CloudAccountSection />
        </div>
        <details>
          <summary
            className="font-mono cursor-pointer list-none text-[9px] tracking-[0.3em] text-dim hover:text-accent"
            style={{ color: "var(--ato-text-dim)" }}
          >
            ▸ ADVANCED — SHARED TOKEN MODE
          </summary>
          <div className="mt-4">
            <CloudSection />
          </div>
        </details>
      </section>

      {/* data — backup / duplicates */}
      <section className="mb-10">
        <SectionHeader title="DATA" jp="データ" />
        <div className="clip-notch bg-panel p-5 backdrop-blur-md" style={{ border: "1px solid var(--ato-border)" }}>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                void buildBackup().then((b) => {
                  downloadBackup(b);
                  toast("Backup downloaded", "success", "バックアップ");
                });
              }}
              className="clip-tag px-4 py-2"
              style={{ background: "color-mix(in srgb, var(--ato-accent) 14%, transparent)", color: "var(--ato-accent)" }}
            >
              <span className="font-mono text-[10px] font-bold tracking-[0.25em]">EXPORT BACKUP</span>
            </button>
            <button
              onClick={() => dataFileRef.current?.click()}
              className="clip-tag px-4 py-2"
              style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)", color: "var(--ato-text-dim)" }}
            >
              <span className="font-mono text-[10px] font-bold tracking-[0.25em]">IMPORT BACKUP</span>
            </button>
            <input
              ref={dataFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                restoreBackup(f)
                  .then((r) => toast(`Restored ${r.tracks} tracks · ${r.playlists} playlists`, "success", "バックアップ復元"))
                  .catch((err) => toast(String(err).slice(0, 80), "error", "復元失敗"));
              }}
            />
            <span className="font-mono text-[9px] tracking-[0.15em] text-dim">
              METADATA + PLAYLISTS AS JSON — AUDIO STAYS ON DISK / CLOUD
            </span>
          </div>
          <DuplicatesList />
        </div>
      </section>

      {/* about */}
      <section className="mb-16">
        <SectionHeader title="ABOUT" jp="情報" />
        <div className="font-mono flex items-center gap-3 text-[10px] tracking-[0.2em] text-dim">
          <Shield className="h-3.5 w-3.5" style={{ color: "var(--ato-gold)" }} />
          ATRI v0.2.0 // LOCAL-FIRST — YOUR MUSIC NEVER LEAVES THIS MACHINE
        </div>
      </section>
    </div>
  );
}

/** Same-song detector + one-click cleanup (keeps the earliest-added copy). */
function DuplicatesList() {
  const tracks = useAllTracks();
  const groups = useMemo(() => findDuplicates(tracks), [tracks]);
  const [expanded, setExpanded] = useState(false);
  if (groups.length === 0) {
    return (
      <p className="font-mono text-[9px] tracking-[0.2em] text-dim">
        DUPLICATES 重複 — NONE FOUND
      </p>
    );
  }
  const shown = expanded ? groups : groups.slice(0, 8);
  const remove = (ids: number[], paths: string[]) => {
    void db
      .transaction("rw", db.tracks, db.sources, async () => {
        await db.tracks.bulkDelete(ids);
        if (paths.length > 0) await db.sources.bulkDelete(paths);
      })
      .then(() => toast(`Removed ${ids.length} duplicate${ids.length === 1 ? "" : "s"}`, "success", "重複を削除"));
  };
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="font-mono text-[9px] tracking-[0.2em] text-dim">
          DUPLICATES 重複 — {groups.length} GROUP{groups.length === 1 ? "" : "S"} FOUND
        </span>
        {groups.length > 8 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="font-mono text-[9px] tracking-[0.2em] text-dim hover:text-accent"
          >
            {expanded ? "SHOW LESS" : `SHOW ALL (${groups.length})`}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {shown.map((g) => (
          <div
            key={g.keeper.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            style={{ border: "1px solid var(--ato-border)", borderRadius: "var(--ato-radius)" }}
          >
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{g.keeper.title}</div>
              <div className="font-mono truncate text-[9px] tracking-[0.15em] text-dim">
                {g.keeper.artist} — {g.duplicates.length + 1} COPIES · {Math.round(g.keeper.duration)}s EACH
              </div>
            </div>
            <button
              onClick={() =>
                remove(
                  g.duplicates.map((t) => t.id),
                  g.duplicates.map((t) => t.path),
                )
              }
              className="clip-tag shrink-0 px-3 py-1.5"
              style={{ background: "color-mix(in srgb, var(--ato-danger) 12%, transparent)", color: "var(--ato-danger)" }}
            >
              <span className="font-mono text-[9px] font-bold tracking-[0.2em]">
                KEEP OLDEST — DELETE {g.duplicates.length}
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
