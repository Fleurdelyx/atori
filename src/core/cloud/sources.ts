import { useUi, type SavedServer } from "@/state/uiStore";
import { useAuth } from "@/core/auth/authStore";
import { authActive } from "@/core/auth/authStore";
import { DEFAULT_SERVER_NAME, DEFAULT_SERVER_URL, defaultServerConfigured } from "./defaults";
import { useCloud } from "./cloudStore";
import { useFavorites } from "./favoritesStore";
import { useCloudPlaylists } from "./playlistStore";
import { toast } from "@/state/toastStore";

/**
 * Saved server connections: "where does my library live". The app keeps a
 * list of workers (own R2 deploy, a friend's shared worker, ...) and one
 * ACTIVE connection; switching swaps the connection and re-pulls everything
 * cloud-side (manifest, favorites, playlists). Local tracks are untouched.
 */

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function list(): SavedServer[] {
  return useUi.getState().savedServers;
}

function write(list: SavedServer[]) {
  useUi.getState().setSavedServers(list);
}

/** Upsert a connection by url+mode; returns the saved entry. */
export function upsertSavedServer(conn: {
  url: string;
  mode: "legacy" | "account";
  token?: string;
  sessionToken?: string;
  user?: SavedServer["user"];
  email?: string;
}): SavedServer {
  const url = conn.url.trim().replace(/\/+$/, "");
  const saved = list();
  const existing = saved.find((s) => s.url === url && s.mode === conn.mode);
  const name = existing?.name ?? hostOf(url);
  const entry: SavedServer = {
    id: existing?.id ?? Math.random().toString(36).slice(2, 8),
    name,
    url,
    mode: conn.mode,
    token: conn.mode === "legacy" ? conn.token : undefined,
    sessionToken: conn.mode === "account" ? conn.sessionToken : undefined,
    user: conn.mode === "account" ? conn.user : undefined,
    email: conn.email,
  };
  write(existing ? saved.map((s) => (s.id === entry.id ? entry : s)) : [...saved, entry]);
  return entry;
}

/** Snapshot the currently configured connection (account or legacy) into the list. */
export function saveActiveConnection(): SavedServer | null {
  const auth = useAuth.getState();
  if (authActive() && auth.serverUrl && auth.sessionToken && auth.user) {
    const entry = upsertSavedServer({
      url: auth.serverUrl,
      mode: "account",
      sessionToken: auth.sessionToken,
      user: auth.user,
      email: auth.user.email,
    });
    useUi.getState().setActiveServerId(entry.id);
    return entry;
  }
  const ui = useUi.getState();
  if (ui.cloudUrl && ui.cloudToken) {
    const entry = upsertSavedServer({ url: ui.cloudUrl, mode: "legacy", token: ui.cloudToken });
    useUi.getState().setActiveServerId(entry.id);
    return entry;
  }
  return null;
}

/** Point the app at a saved server and refresh everything cloud-side. */
export async function switchToServer(id: string): Promise<boolean> {
  const srv = list().find((s) => s.id === id);
  if (!srv) return false;

  if (srv.mode === "legacy") {
    useAuth.getState().setSession(null, null);
    useUi.getState().setCloud(srv.url, srv.token ?? "");
  } else {
    useAuth.getState().setServerUrl(srv.url);
    useAuth.getState().setSession(srv.sessionToken ?? null, srv.user ?? null);
    // entries saved before user snapshots existed restore token-only: an
    // account without its user row reads as signed-out everywhere, so
    // re-resolve it (a dead token surfaces as session-expired instead)
    if (!srv.user && srv.sessionToken) {
      const { me } = await import("@/core/auth/authService");
      const user = await me(srv.url, srv.sessionToken);
      if (user) useAuth.getState().setSession(srv.sessionToken, user);
      else {
        useAuth.getState().setSessionExpired(true);
        toast("Saved session no longer valid: sign in again", "error", "セッション切れ");
      }
    }
  }
  useUi.getState().setActiveServerId(id);

  await useCloud.getState().refresh();
  await Promise.allSettled([
    useFavorites.getState().pull(),
    useCloudPlaylists.getState().pull(),
    import("./playStats").then((m) => m.usePlayStats.getState().pull()),
    import("@/core/cloud/catalogueStore").then((m) => m.useCatalogue.getState().refresh()),
    import("@/core/cloud/cataloguePlaylistStore").then((m) => m.useCataloguePlaylists.getState().pull()),
  ]);
  toast(`Connected to ${srv.name}`, "success", "サーバー切替");
  return true;
}

/** Forget a saved server. Removing the active one leaves the connection up. */
export function removeServer(id: string): void {
  write(list().filter((s) => s.id !== id));
  if (useUi.getState().activeServerId === id) useUi.getState().setActiveServerId(null);
}

/**
 * Activate the built-in default server (the distribution's own R2 worker).
 * Seeds it into the saved list once, points the auth screen at it for
 * sign-in, and marks setup done. No-op when no default is compiled in.
 */
export function activateDefaultServer(): boolean {
  if (!defaultServerConfigured()) return false;
  const entry = upsertSavedServer({
    url: DEFAULT_SERVER_URL,
    mode: "account",
    sessionToken: undefined,
  });
  // label it as the built-in default unless the user saved a custom name
  if (entry.name === hostOf(DEFAULT_SERVER_URL)) {
    write(list().map((s) => (s.id === entry.id ? { ...s, name: DEFAULT_SERVER_NAME } : s)));
  }
  useUi.getState().setActiveServerId(entry.id);
  useUi.getState().setOfflineMode(false);
  useUi.getState().setCloudSetupDone(true);
  useAuth.getState().setServerUrl(DEFAULT_SERVER_URL);
  useAuth.getState().setAuthOpen(true);
  return true;
}
