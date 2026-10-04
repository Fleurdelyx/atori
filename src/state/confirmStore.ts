import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  /** supporting line under the title */
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

interface ConfirmState {
  pending: PendingConfirm | null;
  /** every destructive action goes through here: resolves true only on CONFIRM */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  settle: (ok: boolean) => void;
}

export const useConfirm = create<ConfirmState>()((set, get) => ({
  pending: null,
  confirm: (opts) =>
    new Promise<boolean>((resolve) => {
      const cur = get().pending;
      if (cur) {
        set({ pending: null });
        cur.resolve(false); // a new prompt supersedes the open one
      }
      set({ pending: { ...opts, resolve } });
    }),
  settle: (ok) => {
    const p = get().pending;
    if (!p) return;
    set({ pending: null });
    p.resolve(ok);
  },
}));

/** imperative helper: if (await confirm({ title: "Delete X?" , danger: true })) … */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return useConfirm.getState().confirm(opts);
}
