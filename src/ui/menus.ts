import { addToPlaylist, createPlaylist, getCachedPlaylists } from "@/core/library/playlists";
import { getVisual, removeVisual, setVisual } from "@/core/library/visuals";
import { usePlayback } from "@/core/audio/playbackStore";
import { useUi } from "@/state/uiStore";
import { toast } from "@/state/toastStore";
import { showContextMenu, type ContextMenuItem } from "@/state/contextMenuStore";
import { cacheTrack } from "@/core/cloud/cloudService";
import { useCloudPlaylists } from "@/core/cloud/playlistStore";
import { trackHasTag, type TagStat } from "@/core/library/useLibrary";
import type { TrackMeta } from "@/core/library/types";
import type { AlbumInfo } from "@/core/library/useLibrary";

type MouseEventLike = {
  preventDefault: () => void;
  stopPropagation: () => void;
  clientX: number;
  clientY: number;
};

/** Right-click menu for a track row. */
export async function showTrackMenu(e: MouseEventLike, track: TrackMeta, context: TrackMeta[]) {
  const { playQueue, insertNext, addToQueue } = usePlayback.getState();
  const navigate = useUi.getState().navigate;
  const idx = context.findIndex((t) => t.id === track.id);

  // cloud tracks save to cloud playlists (referenced by object key);
  // local tracks use local Dexie playlists — the two never mix
  const playlistItems: ContextMenuItem[] =
    track.source === "cloud"
      ? [
          ...useCloudPlaylists.getState().playlists.map((pl) => ({
            label: `＋ ${pl.name}`,
            jp: "追加",
            run: () => {
              useCloudPlaylists.getState().addTrack(pl.id, track.path);
              toast(`Added to ${pl.name}`, "success", "プレイリストに追加");
            },
          })),
          {
            label: "＋ New cloud playlist",
            jp: "新規",
            run: () => {
              const p = useCloudPlaylists.getState().create("New Playlist");
              if (p) useCloudPlaylists.getState().addTrack(p.id, track.path);
              toast("Cloud playlist created", "success", "プレイリストを作成");
            },
          },
        ]
      : [
          ...getCachedPlaylists().map((pl) => ({
            label: `＋ ${pl.name}`,
            jp: "追加",
            run: () => {
              void addToPlaylist(pl.id!, [track.id]).then(() =>
                toast(`Added to ${pl.name}`, "success", "プレイリストに追加"),
              );
            },
          })),
          {
            label: "＋ New playlist",
            jp: "新規",
            run: () => {
              void createPlaylist("New Playlist").then((id) =>
                addToPlaylist(id, [track.id]).then(() =>
                  toast("Playlist created", "success", "プレイリストを作成"),
                ),
              );
            },
          },
        ];

  const items: ContextMenuItem[] = [
    {
      label: "Play now",
      jp: "再生",
      run: () => {
        if (idx >= 0) playQueue(context, idx);
        else playQueue([track], 0);
      },
    },
    {
      label: "Play next",
      jp: "次に再生",
      run: () => {
        insertNext(track);
        toast(`Next: ${track.title}`, "info", "次に再生");
      },
    },
    {
      label: "Add to queue",
      jp: "キューに追加",
      run: () => {
        addToQueue(track);
        toast(`Queued: ${track.title}`, "info", "キューに追加");
      },
    },
    { divider: true, label: "" },
    ...playlistItems,
    { divider: true, label: "" },
    {
      label: "Go to album",
      jp: "アルバム",
      run: () => navigate("album", `${track.album}::${track.albumArtist}`, track.source ?? "local"),
    },
    {
      label: "Edit info",
      jp: "編集",
      run: () => useUi.getState().setEditTrackId(track.id),
    },
  ];
  // offer visual attach/remove based on what's stored
  const attached = await getVisual(track.id).catch(() => null);
  if (attached) {
    items.push({
      label: "Remove visual",
      jp: "ビジュアル削除",
      danger: true,
      run: () => {
        void removeVisual(track.id).then(() => toast("Visual removed", "info", "ビジュアル削除"));
      },
    });
  } else {
    items.push({
      label: "Attach visual",
      jp: "ビジュアル",
      run: () => {
        // runs inside the menu click — the file picker keeps its user gesture
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "video/mp4,video/webm,video/quicktime,image/gif,.mp4,.webm,.mov,.gif";
        inp.onchange = () => {
          const f = inp.files?.[0];
          if (!f) return;
          void setVisual(track.id, f).then(() =>
            toast(`Visual attached to ${track.title}`, "success", "ビジュアル設定"),
          );
        };
        inp.click();
      },
    });
  }
  showContextMenu(e, items);
}

/** Right-click menu for a popular-tag chip. */
export function showTagMenu(e: MouseEventLike, tag: TagStat, tracks: TrackMeta[]) {
  const { playQueue } = usePlayback.getState();
  const matching = tracks.filter((t) => trackHasTag(t, tag.key));
  const items: ContextMenuItem[] = [
    {
      label: `Play “${tag.label}”`,
      jp: "再生",
      run: () => {
        if (matching.length > 0) playQueue(matching, 0);
        toast(`Playing ${tag.label}`, "info", "タグ再生");
      },
    },
    { divider: true, label: "" },
    {
      label: `Pin as playlist (${matching.length})`,
      jp: "プレイリスト化",
      run: () => {
        void createPlaylist(tag.label).then((id) =>
          addToPlaylist(id, matching.map((t) => t.id)).then(() =>
            toast(`Pinned “${tag.label}”`, "success", "プレイリストを作成"),
          ),
        );
      },
    },
  ];
  showContextMenu(e, items);
}

/** Right-click menu for an album card. */
export function showAlbumMenu(e: MouseEventLike, album: AlbumInfo, source: "local" | "cloud") {
  const { playQueue, addToQueue } = usePlayback.getState();
  const start = Math.floor(Math.random() * album.tracks.length);
  const items: ContextMenuItem[] = [
    { label: "Play album", jp: "再生", run: () => playQueue(album.tracks, 0) },
    { label: "Shuffle album", jp: "シャッフル", run: () => playQueue(album.tracks, start) },
    {
      label: "Add album to queue",
      jp: "キューに追加",
      run: () => {
        for (const t of album.tracks) addToQueue(t);
        toast(`Queued ${album.name}`, "info", "キューに追加");
      },
    },
    { divider: true, label: "" },
    ...getCachedPlaylists().map((pl) => ({
      label: `＋ ${pl.name}`,
      jp: "追加",
      run: () => {
        void addToPlaylist(pl.id!, album.tracks.map((t) => t.id)).then(() =>
          toast(`Album added to ${pl.name}`, "success", "プレイリストに追加"),
        );
      },
    })),
  ];
  if (source === "cloud") {
    items.push({ divider: true, label: "" });
    items.push({
      label: "Cache offline",
      jp: "オフライン",
      run: () => {
        void Promise.all(album.tracks.map((t) => cacheTrack(t.path))).then(() =>
          toast(`${album.name} cached`, "success", "オフライン保存"),
        );
      },
    });
  }
  showContextMenu(e, items);
}
