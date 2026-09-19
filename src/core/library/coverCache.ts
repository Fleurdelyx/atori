/**
 * CoverCache — object-URL cache over the `covers` blob table.
 * LRU-capped so huge libraries don't leak URLs.
 */
const cache = new Map<string, string>();
const MAX = 300;

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
    cache.set(key, url);
    evictIfNeeded();
    return url;
  }
  // not local — try the cloud worker (covers upload under cover/<key>)
  const { cloudConfigured, cloudCoverUrl } = await import("@/core/cloud/cloudService");
  if (!cloudConfigured()) return null;
  try {
    const res = await fetch(cloudCoverUrl(key));
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
  if (cache.size <= MAX) return;
  const oldest = cache.keys().next().value;
  if (oldest) {
    const stale = cache.get(oldest);
    if (stale) URL.revokeObjectURL(stale);
    cache.delete(oldest);
  }
}

export async function storeCover(key: string, blob: Blob): Promise<void> {
  const { db } = await import("./db");
  const existing = await db.covers.get(key);
  if (!existing) await db.covers.put({ key, blob });
}

/** drop every cached object URL — call when the signed-in account changes */
export function clearCoverCache(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
}
