import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "@/core/auth/authStore";
import { login, register } from "@/core/auth/authService";
import { useCloud } from "@/core/cloud/cloudStore";
import { toast } from "@/state/toastStore";

/**
 * AuthScreen — sign in / create an account on an atori-cloud worker.
 * Opens from SETTINGS → ACCOUNT and automatically when a session expires.
 * Note: password fields intentionally omit the autoComplete attribute.
 */
export function AuthScreen() {
  const authOpen = useAuth((s) => s.authOpen);
  const setAuthOpen = useAuth((s) => s.setAuthOpen);
  const serverUrl = useAuth((s) => s.serverUrl);
  const setServerUrl = useAuth((s) => s.setServerUrl);
  const sessionExpired = useAuth((s) => s.sessionExpired);
  const requestedMode = useAuth((s) => s.authMode);
  const refresh = useCloud((s) => s.refresh);

  const [mode, setMode] = useState<"login" | "register">(requestedMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authOpen) {
      setMode(requestedMode);
      setError(sessionExpired ? "Session expired — sign in again" : "");
      setPassword("");
      setBusy(false);
    }
  }, [authOpen, sessionExpired, requestedMode]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r =
        mode === "login"
          ? await login(serverUrl, email, password)
          : await register(serverUrl, email, password, name);
      useAuth.getState().setSession(r.sessionToken, r.user);
      toast(`Signed in as ${r.user.email}`, "success", "サインイン");
      setAuthOpen(false);
      void refresh();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {authOpen && (
        <motion.div
          key="auth"
          className="fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={() => setAuthOpen(false)}
        >
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ato-bg) 66%, transparent)" }} />
          <motion.div
            className="clip-notch relative w-[min(460px,92vw)] bg-panel p-7 backdrop-blur-xl"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
            initial={{ y: -18, opacity: 0, skewX: -3 }}
            animate={{ y: 0, opacity: 1, skewX: 0 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: "var(--ato-accent)" }}>
                ▞ ACCOUNT
              </span>
              <span className="h-px flex-1" style={{ background: "var(--ato-border)" }} />
              <button
                className="font-mono text-[9px] tracking-[0.2em] text-dim hover:text-accent"
                onClick={() => setAuthOpen(false)}
              >
                ESC
              </button>
            </div>

            {/* mode tabs */}
            <div className="mb-5 flex gap-2">
              {(
                [
                  { id: "login", label: "SIGN IN" },
                  { id: "register", label: "CREATE ACCOUNT" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setMode(t.id);
                    setError("");
                  }}
                  className="clip-tag px-4 py-2"
                  style={{
                    background:
                      mode === t.id ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                    color: mode === t.id ? "var(--ato-bg)" : "var(--ato-text-dim)",
                  }}
                >
                  <span className="font-mono text-[10px] font-bold tracking-[0.2em]">{t.label}</span>
                </button>
              ))}
            </div>

            <label className="mb-3 block">
              <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">SERVER</span>
              <input
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://your-atori-cloud.workers.dev"
                className="font-mono w-full bg-transparent px-3 py-2 text-xs outline-none"
                style={{ border: "1px solid var(--ato-border)" }}
              />
            </label>
            <label className="mb-3 block">
              <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">EMAIL</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
                type="email"
                className="font-mono w-full bg-transparent px-3 py-2 text-xs outline-none"
                style={{ border: "1px solid var(--ato-border)" }}
              />
            </label>
            <label className="mb-3 block">
              <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">PASSWORD</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
                type="password"
                placeholder={mode === "register" ? "at least 8 characters" : ""}
                className="font-mono w-full bg-transparent px-3 py-2 text-xs outline-none"
                style={{ border: "1px solid var(--ato-border)" }}
              />
            </label>
            {mode === "register" && (
              <label className="mb-3 block">
                <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">DISPLAY NAME</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                  className="font-mono w-full bg-transparent px-3 py-2 text-xs outline-none"
                  style={{ border: "1px solid var(--ato-border)" }}
                />
              </label>
            )}

            {error && (
              <p className="font-mono mt-3 text-[10px] tracking-[0.15em]" style={{ color: "var(--ato-danger)" }}>
                {error.toUpperCase()}
              </p>
            )}

            <button
              onClick={() => void submit()}
              disabled={busy || !serverUrl.trim() || !email.trim() || !password}
              className="clip-tag mt-5 w-full py-3 disabled:opacity-40"
              style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
            >
              <span className="font-mono text-[10px] font-bold tracking-[0.3em]">
                {busy ? "CONNECTING…" : mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
              </span>
            </button>

            <p className="font-mono mt-4 text-[9px] leading-relaxed tracking-[0.1em] text-dim">
              YOUR LIBRARY IS SCOPED TO THIS ACCOUNT ON THE WORKER — SIGN IN ON ANY DEVICE TO STREAM IT.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
