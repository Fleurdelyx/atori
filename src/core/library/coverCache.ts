/**
 * CoverCache: object-URL cache over the `covers` blob table.
 * LRU-capped so huge libraries don't leak URLs.
 */
const cache = new Map<string, string>();
const MAX = 300;

/** Evicted URLs are revoked after a grace period, not instantly: during a
 *  fast scroll the LRU can outpace React, and revoking an URL whose <img> is
 *  still mounted blanks the cover. By revoke time the component has either
 *  remounted (fresh URL from loadCoverUrl) or is gone. */
const REVOKE_GRACE_MS = 60_000;
const pendingRevoke = new Map<string, number>(); // key → timer

function scheduleRevoke(key: string, url: string) {
  if (pendingRevoke.has(key)) return; // older eviction already scheduled
  pendingRevoke.set(
    key,
    window.setTimeout(() => {
      pendingRevoke.delete(key);
      URL.revokeObjectURL(url);
    }, REVOKE_GRACE_MS),
  );
}

export function coverUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const hit = cache.get(key);
  if (hit) {
    // refresh LRU order
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  return null; // caller must go through loadCoverUrl for async fill
}

export async function loadCoverUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  const sync = coverUrl(key);
  if (sync) return sync;
  const { db } = await import("./db");
  const row = await db.covers.get(key);
  if (row) {
    const url = URL.createObjectURL(row.blob);
    // the key is live again: don't let a pending eviction revoke this URL
    const timer = pendingRevoke.get(key);
    if (timer != null) {
      window.clearTimeout(timer);
      pendingRevoke.delete(key);
    }
    cache.set(key, url);
    evictIfNeeded();
    return url;
  }
  // not local: try the cloud worker (covers upload under cover/<key>;
  // anonymous sessions can still fetch shared-catalogue covers)
  const { coverStreamUrl } = await import("@/core/cloud/cloudService");
  const cloudUrl = coverStreamUrl(key);
  if (!cloudUrl) return null;
  try {
    const res = await fetch(cloudUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    cache.set(key, url);
    evictIfNeeded();
    return url;
  } catch {
    return null;
  }
}

function evictIfNeeded() {
  while (cache.size > MAX) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    const stale = cache.get(oldest);
    cache.delete(oldest);
    if (stale) scheduleRevoke(oldest, stale);
  }
}

export async function storeCover(key: string, blob: Blob): Promise<void> {
  const { db } = await import("./db");
  const existing = await db.covers.get(key);
  if (!existing) await db.covers.put({ key, blob });
}

/** drop every cached object URL: call when the signed-in account changes */
export function clearCoverCache(): void {
  for (const timer of pendingRevoke.values()) window.clearTimeout(timer);
  pendingRevoke.clear();
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
}
