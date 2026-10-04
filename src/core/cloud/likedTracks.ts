import { useEffect, useMemo } from "react";
import { useAllTracks } from "@/core/library/useLibrary";
import type { TrackMeta } from "@/core/library/types";
import { catalogueReady, cloudConfigured, manifestToTracks } from "./cloudService";
import { useCatalogue } from "./catalogueStore";
import { useCloud } from "./cloudStore";
import { useFavorites } from "./favoritesStore";

/**
 * Liked Songs resolution: favorites are bare path keys, and a liked track
 * may live in the local library, the personal cloud, or the shared
 * catalogue. Local wins over cloud twins (same rule as the sync merge),
 * and the result keeps the keys' order (like order).
 */
export function resolveLikedTracks(keys: string[], ...pools: TrackMeta[][]): TrackMeta[] {
  const byPath = new Map<string, TrackMeta>();
  for (const pool of pools) for (const t of pool) if (!byPath.has(t.path)) byPath.set(t.path, t);
  return keys.map((k) => byPath.get(k)).filter((t): t is TrackMeta => !!t);
}

export function useLikedTracks(): TrackMeta[] {
  const keys = useFavorites((s) => s.keys);
  const local = useAllTracks();
  const cloudManifest = useCloud((s) => s.manifest);
  const catManifest = useCatalogue((s) => s.manifest);

  const liked = useMemo(() => {
    const cloud = cloudManifest ? manifestToTracks(cloudManifest) : [];
    const cat = catManifest ? manifestToTracks(catManifest) : [];
    return resolveLikedTracks(keys, local, cloud, cat);
  }, [keys, local, cloudManifest, catManifest]);

  // keys pointing at cloud/catalogue tracks can't resolve until their
  // manifest is pulled; try once rather than showing an empty list forever
  const unresolved = liked.length < keys.length;
  useEffect(() => {
    if (!unresolved) return;
    const cloud = useCloud.getState();
    if (cloudConfigured() && cloud.manifest === null && cloud.status !== "loading") void cloud.refresh();
    const cat = useCatalogue.getState();
    if (catalogueReady() && cat.manifest === null && cat.status !== "loading") void cat.refresh();
  }, [unresolved]);

  return liked;
}
