import { useState } from "react";
import { Server } from "lucide-react";
import { useUi } from "@/state/uiStore";
import { removeServer, saveActiveConnection, switchToServer } from "@/core/cloud/sources";
import { cloudConfigured } from "@/core/cloud/cloudService";
import { toast } from "@/state/toastStore";

/** Saved server connections — click one to switch where your library lives. */
export function SavedServers() {
  const savedServers = useUi((s) => s.savedServers);
  const activeServerId = useUi((s) => s.activeServerId);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const connected = cloudConfigured();

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <span className="font-mono flex items-center gap-2 text-[10px] tracking-[0.35em] text-dim">
        <Server className="h-3.5 w-3.5" /> SERVERS サーバー
      </span>
      {savedServers.map((s) => {
        const active = s.id === activeServerId;
        return (
          <span key={s.id} className="flex items-center gap-1">
            <button
              onClick={() => void switchToServer(s.id)}
              className="clip-tag px-3 py-1.5 transition-colors"
              style={{
                background: active ? "var(--ato-accent)" : "color-mix(in srgb, var(--ato-text) 6%, transparent)",
                color: active ? "var(--ato-bg)" : "var(--ato-text-dim)",
              }}
              title={`${s.url} — ${s.mode}`}
            >
              <span className="font-mono text-[10px] font-bold tracking-[0.15em]">{s.name.toUpperCase()}</span>
              <span className="font-mono ml-2 text-[9px] opacity-60">
                {s.mode === "account" ? s.email ?? "account" : "token"}
              </span>
            </button>
            <button
              onClick={() => {
                if (confirmId === s.id) {
                  removeServer(s.id);
                  setConfirmId(null);
                  toast(`Removed ${s.name}`, "info", "サーバー削除");
                } else {
                  setConfirmId(s.id);
                  setTimeout(() => setConfirmId((c) => (c === s.id ? null : c)), 2500);
                }
              }}
              className="font-mono text-[9px] text-dim hover:text-accent"
              aria-label={`Remove ${s.name}`}
            >
              {confirmId === s.id ? "SURE?" : "×"}
            </button>
          </span>
        );
      })}
      <button
        onClick={() => {
          if (!connected) {
            toast("Configure a worker connection first", "error", "未接続");
            return;
          }
          const entry = saveActiveConnection();
          if (entry) toast(`Saved ${entry.name}`, "success", "サーバー保存");
        }}
        disabled={!connected}
        className="clip-tag px-3 py-1.5 transition-colors disabled:opacity-40"
        style={{ background: "color-mix(in srgb, var(--ato-accent-2) 12%, transparent)", color: "var(--ato-accent-2)" }}
      >
        <span className="font-mono text-[10px] font-bold tracking-[0.2em]">SAVE CURRENT</span>
      </button>
    </div>
  );
}
