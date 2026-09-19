import { db } from "./db";

/**
 * FS-Access permission management.
 * Chromium grants handle permissions per session; after a restart every
 * directory handle needs one user-gesture `requestPermission` call.
 * We persist the ROOT directory handles at import time so one grant
 * covers the whole tree.
 */

const ROOT_DIRS_KEY = "rootDirs";

interface PermHandleLike {
  queryPermission?(d: { mode: string }): Promise<PermissionState>;
  requestPermission?(d: { mode: string }): Promise<PermissionState>;
}

export async function saveRootDir(dir: FileSystemDirectoryHandle): Promise<void> {
  const row = await db.meta.get(ROOT_DIRS_KEY);
  const list = (row?.value as FileSystemDirectoryHandle[] | undefined) ?? [];
  if (!list.some((h) => h.name === dir.name)) list.push(dir);
  await db.meta.put({ key: ROOT_DIRS_KEY, value: list });
}

export async function getRootDirs(): Promise<FileSystemDirectoryHandle[]> {
  const row = await db.meta.get(ROOT_DIRS_KEY);
  return (row?.value as FileSystemDirectoryHandle[] | undefined) ?? [];
}

/** True when at least one root directory needs a fresh permission grant. */
export async function needsReconnect(): Promise<boolean> {
  const roots = await getRootDirs();
  if (roots.length === 0) return false;
  for (const root of roots) {
    const h = root as unknown as PermHandleLike;
    try {
      const state = (await h.queryPermission?.({ mode: "read" })) ?? "granted";
      if (state !== "granted") return true;
    } catch {
      return true;
    }
  }
  return false;
}

/** Request read permission on every root that needs it. MUST run in a user gesture. */
export async function requestAllPermissions(): Promise<boolean> {
  const roots = await getRootDirs();
  let allGranted = true;
  for (const root of roots) {
    const h = root as unknown as PermHandleLike;
    try {
      let state = (await h.queryPermission?.({ mode: "read" })) ?? "granted";
      if (state !== "granted") {
        state = (await h.requestPermission?.({ mode: "read" })) ?? "denied";
      }
      if (state !== "granted") allGranted = false;
    } catch {
      allGranted = false;
    }
  }
  return allGranted;
}
