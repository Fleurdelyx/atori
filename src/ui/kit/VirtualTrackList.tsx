import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { TrackMeta } from "@/core/library/types";
import { TrackRow } from "@/ui/components";

const ROW_HEIGHT = 48;

/**
 * Virtualized track list (TanStack Virtual) — smooth with 10k+ rows.
 * Owns its scroll container; give it a bounded height via className.
 */
export function VirtualTrackList({
  tracks,
  showAlbum = false,
  className = "",
  onRemove,
  lyricsHits,
  selection,
}: {
  tracks: TrackMeta[];
  showAlbum?: boolean;
  className?: string;
  onRemove?: (track: TrackMeta) => void;
  /** track ids whose current search match came from the lyrics */
  lyricsHits?: Set<number>;
  /** batch-select mode — forwarded to every row */
  selection?: { selected: Set<number>; onToggle: (id: number) => void };
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div ref={parentRef} className={`overflow-y-auto ${className}`}>
      <div style={{ height: virt.getTotalSize(), position: "relative" }}>
        {virt.getVirtualItems().map((vi) => (
          <div
            key={tracks[vi.index].id}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: vi.size,
              transform: `translateY(${vi.start}px)`,
            }}
          >
            <TrackRow
              track={tracks[vi.index]}
              index={vi.index}
              context={tracks}
              showAlbum={showAlbum}
              onRemove={onRemove}
              lyricsHit={lyricsHits?.has(tracks[vi.index].id)}
              selection={selection}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
