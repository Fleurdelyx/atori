import type { AuthUser } from "./authStore";

/**
 * AuthService: HTTP client for the worker's /api/auth/* endpoints.
 * Throws Error with the worker's user-facing message on failure.
 */

export interface AuthResult {
  sessionToken: string;
  user: AuthUser;
}

function base(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function postAuth(path: string, serverUrl: string, body: unknown): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch(`${base(serverUrl)}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Server unreachable: check the URL");
  }
  const data = (await res.json().catch(() => ({}))) as { sessionToken?: string; user?: AuthUser; error?: string };
  if (!res.ok || !data.sessionToken || !data.user) {
    throw new Error(data.error ?? `Sign-in failed (HTTP ${res.status})`);
  }
  return { sessionToken: data.sessionToken, user: data.user };
}

export async function register(serverUrl: string, email: string, password: string, name: string): Promise<AuthResult> {
  return postAuth("/api/auth/register", serverUrl, { email, password, name });
}

export async function login(serverUrl: string, email: string, password: string): Promise<AuthResult> {
  return postAuth("/api/auth/login", serverUrl, { email, password });
}

export async function logout(serverUrl: string, sessionToken: string): Promise<void> {
  try {
    await fetch(`${base(serverUrl)}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
  } catch {
    // best-effort: the local session is cleared regardless
  }
}

/** Change the account email; needs the current password. Returns the updated user. */
export async function changeEmail(
  serverUrl: string,
  sessionToken: string,
  email: string,
  password: string,
): Promise<AuthUser> {
  const res = await fetch(`${base(serverUrl)}/api/auth/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
  if (!res.ok || !data.user) throw new Error(data.error ?? `Email change failed (HTTP ${res.status})`);
  return data.user;
}

/** Change the password; needs the current one. Existing sessions stay valid. */
export async function changePassword(
  serverUrl: string,
  sessionToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch(`${base(serverUrl)}/api/auth/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Password change failed (HTTP ${res.status})`);
}

/** null = the session is invalid or expired */
export async function me(serverUrl: string, sessionToken: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${base(serverUrl)}/api/auth/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: AuthUser };
    return data.user ?? null;
  } catch {
    return null;
  }
}
