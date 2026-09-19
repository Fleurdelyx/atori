import { create } from "zustand";

export interface Toast {
  id: number;
  text: string;
  jp?: string;
  kind: "info" | "success" | "error";
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, kind?: Toast["kind"], jp?: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (text, kind = "info", jp) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind, jp }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3800);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(text: string, kind: Toast["kind"] = "info", jp?: string) {
  useToasts.getState().push(text, kind, jp);
}
