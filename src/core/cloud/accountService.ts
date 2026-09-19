import { accountCfg } from "@/core/auth/authStore";
import { CloudAuthError } from "./cloudService";

/**
 * AccountService — favorites + cloud playlists endpoints (accounts mode only).
 * All functions no-op/throw when not signed in; callers check accountActive().
 */

export interface CloudPlaylist {
  id: string;
  name: string;
  trackKeys: string[];
  updatedAt: number;
}

export function accountActive(): boolean {
  return accountCfg() !== null;
}

function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const cfg = accountCfg();
  if (!cfg) throw new CloudAuthError();
  return fetch(`${cfg.base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.token}`, ...(init?.headers ?? {}) },
  });
}

export async function fetchFavorites(): Promise<string[]> {
  const res = await authedFetch("/api/favorites");
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`favorites fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as { keys?: string[] };
  return data.keys ?? [];
}

export async function putFavorites(keys: string[]): Promise<void> {
  const res = await authedFetch("/api/favorites", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys }),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`favorites write failed: HTTP ${res.status}`);
}

export async function fetchPlaylists(): Promise<CloudPlaylist[]> {
  const res = await authedFetch("/api/playlists");
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`playlists fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as { playlists?: CloudPlaylist[] };
  return data.playlists ?? [];
}

export async function putPlaylists(playlists: CloudPlaylist[]): Promise<void> {
  const res = await authedFetch("/api/playlists", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playlists }),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`playlists write failed: HTTP ${res.status}`);
}
