import { describe, expect, it } from "vitest";
import { useUi } from "./uiStore";

describe("uiStore queueStyle", () => {
  it("defaults to the phonograph queue view", () => {
    expect(useUi.getState().queueStyle).toBe("phonograph");
  });

  it("setQueueStyle switches layouts", () => {
    useUi.getState().setQueueStyle("panel");
    expect(useUi.getState().queueStyle).toBe("panel");
    useUi.getState().setQueueStyle("phonograph");
    expect(useUi.getState().queueStyle).toBe("phonograph");
  });

  it("persists the choice to localStorage", () => {
    useUi.getState().setQueueStyle("panel");
    const raw = localStorage.getItem("atori-ui");
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw!) as { state: { queueStyle?: string } };
    expect(saved.state.queueStyle).toBe("panel");
    useUi.getState().setQueueStyle("phonograph");
  });
});

describe("uiStore view history (back/forward)", () => {
const flush = () => new Promise((r) => setTimeout(r, 10));

  it("navigating pushes history and truncates the forward stack", async () => {
    const s = useUi.getState();
    // start from a known point
    s.navigate("home");
    s.navigate("library");
    s.navigate("settings");
    expect(useUi.getState().view).toBe("settings");
    expect(useUi.getState().viewHistoryIndex).toBe(useUi.getState().viewHistory.length - 1);
    // back twice → home
    useUi.getState().navigateBack(); await flush();
    useUi.getState().navigateBack(); await flush();
    expect(useUi.getState().view).toBe("home");
    // forward → library
    useUi.getState().navigateForward(); await flush();
    expect(useUi.getState().view).toBe("library");
    // a fresh navigation from here drops the forward entry (settings)
    useUi.getState().navigate("cloud");
    expect(useUi.getState().view).toBe("cloud");
    useUi.getState().navigateForward(); await flush();
    expect(useUi.getState().view).toBe("cloud"); // nothing ahead anymore
  });

  it("does not duplicate history for repeat navigations to the same view", () => {
    useUi.getState().navigate("home");
    useUi.getState().navigate("home");
    const { viewHistory, viewHistoryIndex } = useUi.getState();
    expect(viewHistory[viewHistoryIndex].view).toBe("home");
    expect(viewHistory[viewHistoryIndex - 1]?.view).not.toBe("home");
    useUi.getState().navigate("home"); // leave the store on home for other tests
  });

  it("album navigation carries its key in history", async () => {
    useUi.getState().navigate("album", "Some Album::Some Artist", "cloud");
    useUi.getState().navigate("home");
    useUi.getState().navigateBack(); await flush();
    const s = useUi.getState();
    expect(s.view).toBe("album");
    expect(s.albumKey).toBe("Some Album::Some Artist");
    expect(s.albumSource).toBe("cloud");
    useUi.getState().navigate("home");
  });

  it("back/forward are no-ops at the stack ends", async () => {
    useUi.getState().navigate("home");
    useUi.getState().navigate("library");
    const before = useUi.getState().viewHistoryIndex;
    useUi.getState().navigateForward(); await flush(); // already at the top
    expect(useUi.getState().viewHistoryIndex).toBe(before);
    // walk to the bottom, then one more back must stay
    for (let i = 0; i < 12; i++) {
      useUi.getState().navigateBack();
      await flush();
    }
    const bottom = useUi.getState().viewHistoryIndex;
    expect(bottom).toBe(0);
    useUi.getState().navigateBack(); await flush();
    expect(useUi.getState().viewHistoryIndex).toBe(0);
    useUi.getState().navigate("home");
  });

  it("openPlaylist lands in the history too", async () => {
    useUi.getState().navigate("home");
    useUi.getState().openPlaylist(1);
    expect(useUi.getState().view).toBe("library");
    useUi.getState().navigateBack(); await flush();
    expect(useUi.getState().view).toBe("home");
    useUi.getState().navigate("home");
  });

  it("railCollapsed persists to localStorage", () => {
    useUi.getState().setRailCollapsed(true);
    const saved = JSON.parse(localStorage.getItem("atori-ui")!) as { state: { railCollapsed?: boolean } };
    expect(saved.state.railCollapsed).toBe(true);
    useUi.getState().setRailCollapsed(false);
  });
});
