import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * AuthStore — account session for the atori-cloud worker (accounts mode).
 * serverUrl + sessionToken + user persist in localStorage ("atori-auth"),
 * the same tradeoff the legacy shared token had. sessionExpired/authOpen
 * are runtime-only flags.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  serverUrl: string;
  sessionToken: string | null;
  user: AuthUser | null;
  /** set when the worker rejects the stored session (401) — prompts re-login */
  sessionExpired: boolean;
  /** AuthScreen visibility */
  authOpen: boolean;
  /** which tab AuthScreen opens on */
  authMode: "login" | "register";
  setServerUrl: (url: string) => void;
  setSession: (token: string | null, user: AuthUser | null) => void;
  setSessionExpired: (v: boolean) => void;
  setAuthOpen: (v: boolean) => void;
  setAuthMode: (m: "login" | "register") => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      serverUrl: "",
      sessionToken: null,
      user: null,
      sessionExpired: false,
      authOpen: false,
      authMode: "login",
      setServerUrl: (serverUrl) => set({ serverUrl }),
      setSession: (sessionToken, user) => set({ sessionToken, user, sessionExpired: false }),
      setSessionExpired: (sessionExpired) => set({ sessionExpired }),
      setAuthOpen: (authOpen) => set({ authOpen }),
      setAuthMode: (authMode) => set({ authMode }),
    }),
    {
      name: "atori-auth",
      partialize: (s) => ({ serverUrl: s.serverUrl, sessionToken: s.sessionToken, user: s.user }),
    },
  ),
);

/** true when an account session is ready to talk to the worker */
export function authActive(): boolean {
  const s = useAuth.getState();
  return Boolean(s.serverUrl && s.sessionToken && s.user);
}

/** account-mode credentials for request building; null when not in account mode */
export function accountCfg(): { base: string; token: string } | null {
  const s = useAuth.getState();
  if (!authActive()) return null;
  return { base: s.serverUrl.trim().replace(/\/+$/, ""), token: s.sessionToken! };
}
