import { create } from "zustand";

export interface ContextMenuItem {
  label: string;
  jp?: string;
  danger?: boolean;
  divider?: boolean;
  run?: () => void;
}

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  openAt: (x: number, y: number, items: ContextMenuItem[]) => void;
  close: () => void;
}

export const useContextMenu = create<ContextMenuState>()((set) => ({
  open: false,
  x: 0,
  y: 0,
  items: [],
  openAt: (x, y, items) => set({ open: true, x, y, items }),
  close: () => set({ open: false }),
}));

/** Open a gacha context menu at the pointer for the given items. */
export function showContextMenu(e: { preventDefault: () => void; stopPropagation: () => void; clientX: number; clientY: number }, items: ContextMenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  useContextMenu.getState().openAt(e.clientX, e.clientY, items);
}
