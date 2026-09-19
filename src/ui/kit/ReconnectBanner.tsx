import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { needsReconnect, requestAllPermissions } from "@/core/library/fsPermissions";
import { toast } from "@/state/toastStore";

/**
 * ReconnectBanner — after a restart, FS-Access directory handles need one
 * user-gesture permission grant. Shows a banner when that's the case.
 */
export function ReconnectBanner() {
  const [needs, setNeeds] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void needsReconnect().then((v) => alive && setNeeds(v));
    const onFocus = () => void needsReconnect().then((v) => alive && setNeeds(v));
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!needs) return null;

  const reconnect = () => {
    setBusy(true);
    void requestAllPermissions().then((ok) => {
      setNeeds(!ok);
      setBusy(false);
      toast(
        ok ? "Music folders reconnected" : "Permission denied — playback unavailable",
        ok ? "success" : "error",
        ok ? "再接続完了" : "拒否されました",
      );
    });
  };

  return (
    <div
      className="clip-slash-both fixed bottom-24 left-6 z-[75] flex max-w-sm items-start gap-3 bg-panel p-4 backdrop-blur-md"
      style={{
        border: "1px solid var(--ato-accent)",
        boxShadow: "0 0 28px color-mix(in srgb, var(--ato-accent) 25%, transparent)",
        transition: "opacity .3s ease",
      }}
    >
      <FolderOpen className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--ato-accent)" }} />
      <div>
        <div className="text-[13px] font-semibold">FOLDER ACCESS EXPIRED</div>
        <div className="font-jp text-[9px] tracking-[0.25em] text-dim">フォルダ再接続</div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
          The browser needs one click to restore access to your imported music folders.
        </p>
        <button
          onClick={reconnect}
          disabled={busy}
          className="clip-tag font-mono mt-2.5 px-4 py-1.5 text-[10px] font-bold tracking-[0.25em] disabled:opacity-50"
          style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
        >
          {busy ? "CONNECTING…" : "RECONNECT"}
        </button>
      </div>
    </div>
  );
}
