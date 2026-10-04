import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useAuth, type AuthUser } from "@/core/auth/authStore";
import { changeEmail, changePassword } from "@/core/auth/authService";

/**
 * AccountPanel: signed-in account self-management over a worker. Two
 * password-confirmed forms: change the account email, change the password.
 * A true forgot-password mail flow needs an email service; until one exists,
 * password changes run through this authenticated panel.
 */
export function AccountPanel({ open, onClose, onUser }: { open: boolean; onClose: () => void; onUser: (u: AuthUser) => void }) {
  const user = useAuth((s) => s.user);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setNewEmail("");
      setEmailPassword("");
      setEmailError("");
      setCurrentPassword("");
      setNewPassword("");
      setPwError("");
    }
  }, [open]);

  const submitEmail = async () => {
    const a = useAuth.getState();
    if (!a.serverUrl || !a.sessionToken) return;
    setEmailError("");
    setEmailBusy(true);
    try {
      const updated = await changeEmail(a.serverUrl, a.sessionToken, newEmail.trim(), emailPassword);
      onUser(updated);
      setNewEmail("");
      setEmailPassword("");
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Email change failed");
    } finally {
      setEmailBusy(false);
    }
  };

  const submitPassword = async () => {
    const a = useAuth.getState();
    if (!a.serverUrl || !a.sessionToken) return;
    setPwError("");
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    setPwBusy(true);
    try {
      await changePassword(a.serverUrl, a.sessionToken, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Password change failed");
    } finally {
      setPwBusy(false);
    }
  };

  const field = (label: string, value: string, onChange: (v: string) => void, placeholder: string, type = "text") => (
    <label className="block">
      <span className="font-mono mb-1 block text-[9px] tracking-[0.3em] text-dim">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        className="font-mono w-full bg-transparent px-3 py-2 text-xs outline-none"
        style={{ border: "1px solid var(--ato-border)" }}
      />
    </label>
  );

  return (
    <AnimatePresence>
      {open && user && (
        <motion.div
          key="account-panel"
          className="fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={onClose}
        >
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ato-bg) 62%, transparent)" }} />
          <motion.div
            className="clip-notch relative w-[min(460px,92vw)] bg-panel p-6 backdrop-blur-xl"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: "var(--ato-accent)" }}>
                ▞ ACCOUNT SETTINGS
              </span>
              <button onClick={onClose} className="text-dim hover:text-accent" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-5 text-xs text-dim">
              <div className="truncate text-sm text-text">{user.name}</div>
              <div className="font-mono truncate text-[10px]">{user.email}</div>
              {user.createdAt ? <div className="mt-1">member since {new Date(user.createdAt).toLocaleDateString()}</div> : null}
            </div>

            <div className="mb-2 font-mono text-[9px] tracking-[0.3em] text-dim">CHANGE EMAIL メールアドレス変更</div>
            <div className="flex flex-col gap-2">
              {field("NEW EMAIL", newEmail, setNewEmail, "you@example.com")}
              {field("CURRENT PASSWORD", emailPassword, setEmailPassword, "confirm with your password", "password")}
              {emailError && (
                <p className="font-mono text-[10px] tracking-wide" style={{ color: "var(--ato-danger)" }}>
                  {emailError}
                </p>
              )}
              <button
                onClick={() => void submitEmail()}
                disabled={emailBusy || !newEmail.trim() || !emailPassword}
                className="clip-tag mt-1 self-start px-4 py-2 disabled:opacity-40"
                style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.2em]">{emailBusy ? "SAVING…" : "UPDATE EMAIL"}</span>
              </button>
            </div>

            <div className="mb-2 mt-6 font-mono text-[9px] tracking-[0.3em] text-dim">CHANGE PASSWORD パスワード変更</div>
            <div className="flex flex-col gap-2">
              {field("CURRENT PASSWORD", currentPassword, setCurrentPassword, "current password", "password")}
              {field("NEW PASSWORD", newPassword, setNewPassword, "at least 8 characters", "password")}
              {pwError && (
                <p className="font-mono text-[10px] tracking-wide" style={{ color: "var(--ato-danger)" }}>
                  {pwError}
                </p>
              )}
              <button
                onClick={() => void submitPassword()}
                disabled={pwBusy || !currentPassword || !newPassword}
                className="clip-tag mt-1 self-start px-4 py-2 disabled:opacity-40"
                style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.2em]">{pwBusy ? "SAVING…" : "UPDATE PASSWORD"}</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
