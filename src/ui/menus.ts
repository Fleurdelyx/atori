import { addToPlaylist, createPlaylist, deletePlaylist, getCachedPlaylists } from "@/core/library/playlists";
import { getVisual, removeVisual, setVisual } from "@/core/library/visuals";
import { deleteFromLibrary } from "@/core/library/importService";
import { db, type Playlist } from "@/core/library/db";
import { engine } from "@/core/audio/AudioEngine";
import {
  cloudConfigured,
  deleteCatalogueTracks,
  deleteCloudTracks,
  isAdminUser,
  resolveSourceFile,
  uploadTracks,
} from "@/core/cloud/cloudService";
import { useCloud } from "@/core/cloud/cloudStore";
import { useCatalogue } from "@/core/cloud/catalogueStore";
import { useCataloguePlaylists } from "@/core/cloud/cataloguePlaylistStore";
import { usePlayback } from "@/core/audio/playbackStore";
import { useUi, type AlbumSource } from "@/state/uiStore";
import { toast } from "@/state/toastStore";
import { showContextMenu, type ContextMenuItem } from "@/state/contextMenuStore";
import { confirm } from "@/state/confirmStore";
import { cacheTrack } from "@/core/cloud/cloudService";
import { useCloudPlaylists } from "@/core/cloud/playlistStore";
import { isLocalMirror } from "@/core/cloud/localPlaylistMirror";
import { useFavorites } from "@/core/cloud/favoritesStore";
import { trackHasTag, type TagStat } from "@/core/library/useLibrary";
import type { TrackMeta } from "@/core/library/types";
import type { AlbumInfo } from "@/core/library/useLibrary";

type MouseEventLike = {
  preventDefault: () => void;
  stopPropagation: () => void;
  clientX: number;
  clientY: number;
};

/**
 * Shared off-screen file input for programmatic picks. Mobile browsers ignore
 * .click() on inputs that were never added to the document, so context-menu
 * actions (attach visual, playlist picture) all route through this one
 * persistent element.
 */
let sharedPick: HTMLInputElement | null = null;
function pickFile(accept: string, onPick: (file: File) => void) {
  if (!sharedPick) {
    sharedPick = document.createElement("input");
    sharedPick.type = "file";
    sharedPick.style.position = "fixed";
    sharedPick.style.left = "-9999px";
    sharedPick.style.width = "1px";
    sharedPick.style.height = "1px";
    sharedPick.style.opacity = "0";
    document.body.appendChild(sharedPick);
  }
  sharedPick.accept = accept;
  sharedPick.onchange = () => {
    const f = sharedPick?.files?.[0];
    if (f) onPick(f);
    sharedPick!.value = "";
  };
  sharedPick.click();
}

/** Right-click menu for a track row. */
export async function showTrackMenu(e: MouseEventLike, track: TrackMeta, context: TrackMeta[]) {
  // must happen synchronously: preventDefault after an await is too late and
  // the browser's native menu shows alongside ours
  e.preventDefault();
  e.stopPropagation();
  const { playQueue, insertNext, addToQueue } = usePlayback.getState();
  const navigate = useUi.getState().navigate;
  const idx = context.findIndex((t) => t.id === track.id);

  // cloud tracks save to cloud playlists (referenced by object key);
  // local tracks use local Dexie playlists: the two never mix.
  // Shared catalogue rows file into catalogue playlists (admin curation).
  const playlistItems: ContextMenuItem[] =
    track.path.startsWith("catalogue/")
      ? isAdminUser()
        ? [
            ...useCataloguePlaylists.getState().playlists.map((pl) => ({
              label: `＋ ${pl.name}`,
              jp: "追加",
              run: () => {
                useCataloguePlaylists.getState().addTrack(pl.id, track.path);
                toast(`Added to ${pl.name}`, "success", "プレイリストに追加");
              },
            })),
            {
              label: "＋ New catalogue playlist",
              jp: "新規",
              run: () => {
                const p = useCataloguePlaylists.getState().create("New Playlist");
                if (p) useCataloguePlaylists.getState().addTrack(p.id, track.path);
                toast("Catalogue playlist created", "success", "プレイリストを作成");
              },
            },
          ]
        : []
      : track.source === "cloud"
        ? [
            ...useCloudPlaylists.getState().playlists.filter((pl) => !isLocalMirror(pl)).map((pl) => ({
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
              run: () => useUi.getState().setPlaylistCreate({ seedTrackIds: [track.id] }),
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
    ...(playlistItems.length > 0 ? ([{ divider: true, label: "" }] as ContextMenuItem[]) : []),
    ...playlistItems,
    ...(playlistItems.length > 0 ? ([{ divider: true, label: "" }] as ContextMenuItem[]) : []),
    {
      label: useFavorites.getState().keys.includes(track.path) ? "Unlike" : "Like",
      jp: "お気に入り",
      run: () => useFavorites.getState().toggle(track.path),
    },
    {
      label: "Go to album",
      jp: "アルバム",
      run: () => navigate("album", `${track.album}::${track.albumArtist}`, track.source ?? "local"),
    },
    {
      label: "Edit info",
      jp: "編集",
      run: () => {
        // cloud rows have no local record until first play: seed the shadow
        // row (from the merged track) so the editor has something to edit
        if (track.source === "cloud") void db.tracks.put(track);
        useUi.getState().setEditTrackId(track.id);
      },
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
        // runs inside the menu click: the picker keeps its user gesture
        pickFile("video/mp4,video/webm,video/quicktime,image/gif,.mp4,.webm,.mov,.gif", (f) => {
          void setVisual(track.id, f).then(() =>
            toast(`Visual attached to ${track.title}`, "success", "ビジュアル設定"),
          );
        });
      },
    });
  }
  // local rows only: cloud tracks live on the server, not in this library
  if (track.source !== "cloud") {
    if (cloudConfigured()) {
      items.push({
        label: "Upload to cloud",
        jp: "クラウドへ",
        run: () => {
          void (async () => {
            toast(`Uploading ${track.title}…`, "info", "アップロード");
            try {
              const r = await uploadTracks([track], resolveSourceFile, undefined, async (k) => (await db.covers.get(k))?.blob ?? null);
              await useCloud.getState().refresh();
              toast(
                r.failed
                  ? `Upload failed for ${track.title}`
                  : r.manifestWritten
                    ? `Uploaded ${track.title}`
                    : `Uploaded ${track.title}, cloud list unreachable: retry later`,
                r.failed || !r.manifestWritten ? "error" : "success",
                "クラウド",
              );
            } catch {
              toast("Upload failed", "error", "アップロード失敗");
            }
          })();
        },
      });
    }
    items.push({ divider: true, label: "" });
    items.push({
      label: "Delete from library",
      jp: "ライブラリから削除",
      danger: true,
      run: () => {
        void (async () => {
          if (!(await confirm({ title: `DELETE ${track.title}?`, body: "Removes the song from your library.", danger: true }))) return;
          void deleteFromLibrary([track.path]).then((n) => {
            if (n > 0) toast(`Deleted ${track.title}`, "info", "削除済み");
          });
        })();
      },
    });
  } else if (cloudConfigured()) {
    if (track.path.startsWith("catalogue/")) {
      // shared catalogue: only admins may remove entries listeners stream
      if (isAdminUser()) {
        items.push({
          label: "Delete from catalogue",
          jp: "カタログから削除",
          danger: true,
          run: () => {
            void (async () => {
              if (
                !(await confirm({
                  title: `DELETE ${track.title} FROM THE CATALOGUE?`,
                  body: "Every listener of this server loses access to it.",
                  danger: true,
                }))
              )
                return;
              try {
                await deleteCatalogueTracks([track.path]);
                await useCatalogue.getState().refresh();
                toast(`Deleted ${track.title} from catalogue`, "info", "削除済み");
              } catch {
                toast("Catalogue delete failed", "error", "削除失敗");
              }
            })();
          },
        });
      }
    } else {
      items.push({
        label: "Delete from cloud",
        jp: "クラウドから削除",
        danger: true,
        run: () => {
          void (async () => {
            if (
              !(await confirm({
                title: `DELETE ${track.title} FROM THE CLOUD?`,
                body: "The upload is removed from the server, on all your devices.",
                danger: true,
              }))
            )
              return;
            try {
              await deleteCloudTracks([track.path]);
              await useCloud.getState().refresh();
              toast(`Deleted ${track.title} from cloud`, "info", "削除済み");
            } catch {
              toast("Cloud delete failed", "error", "削除失敗");
            }
          })();
        },
      });
    }
  }
  showContextMenu(e, items);
}

/** Right-click menu for a popular-tag chip. */
export function showTagMenu(e: MouseEventLike, tag: TagStat, tracks: TrackMeta[]) {
  e.preventDefault();
  e.stopPropagation();
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
export function showAlbumMenu(e: MouseEventLike, album: AlbumInfo, source: AlbumSource) {
  e.preventDefault();
  e.stopPropagation();
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
    {
      label: "Edit info",
      jp: "編集",
      run: () => {
        // cloud rows need a local shadow record for the editor to edit
        if (source === "cloud") for (const t of album.tracks) void db.tracks.put(t);
        useUi.getState().setEditAlbumKey(album.key);
      },
    },
  ];
  // cloud albums belong to cloud playlists (keyed by object path); local
  // albums use local Dexie playlists: the two never mix
  if (source === "cloud") {
    items.push({ divider: true, label: "" });
    items.push(
      ...useCloudPlaylists.getState().playlists.filter((pl) => !isLocalMirror(pl)).map((pl) => ({
        label: `＋ ${pl.name}`,
        jp: "追加",
        run: () => {
          for (const t of album.tracks) useCloudPlaylists.getState().addTrack(pl.id, t.path);
          toast(`Album added to ${pl.name}`, "success", "プレイリストに追加");
        },
      })),
      {
        label: "＋ New cloud playlist",
        jp: "新規",
        run: () => {
          const p = useCloudPlaylists.getState().create("New Playlist");
          if (p) for (const t of album.tracks) useCloudPlaylists.getState().addTrack(p.id, t.path);
          toast("Cloud playlist created", "success", "プレイリストを作成");
        },
      },
    );
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
    if (cloudConfigured()) {
      const cataloguePaths = album.tracks.filter((t) => t.path.startsWith("catalogue/")).map((t) => t.path);
      const personalPaths = album.tracks.filter((t) => t.source === "cloud" && !t.path.startsWith("catalogue/")).map((t) => t.path);
      if (cataloguePaths.length > 0 && !isAdminUser()) {
        // listeners cannot remove shared catalogue entries
      } else if (cataloguePaths.length > 0 || personalPaths.length > 0) {
        items.push({
          label: "Delete album from cloud",
          jp: "クラウドから削除",
          danger: true,
          run: () => {
            void (async () => {
              if (
                !(await confirm({
                  title: `DELETE ${album.name} FROM THE CLOUD?`,
                  body: `${album.tracks.length} tracks are removed from the server.`,
                  danger: true,
                }))
              )
                return;
              try {
                if (personalPaths.length > 0) await deleteCloudTracks(personalPaths);
                if (cataloguePaths.length > 0) await deleteCatalogueTracks(cataloguePaths);
                await useCloud.getState().refresh();
                await useCatalogue.getState().refresh();
                toast(`Deleted ${album.name} from cloud`, "info", "削除済み");
              } catch {
                toast("Cloud delete failed", "error", "削除失敗");
              }
            })();
          },
        });
      }
    }
  } else if (source === "catalogue") {
    // organizing the shared catalogue is admin-only; listeners just play
    if (isAdminUser()) {
      items.push({ divider: true, label: "" });
      items.push(
        ...useCataloguePlaylists.getState().playlists.map((pl) => ({
          label: `＋ ${pl.name}`,
          jp: "追加",
          run: () => {
            for (const t of album.tracks) useCataloguePlaylists.getState().addTrack(pl.id, t.path);
            toast(`Album added to ${pl.name}`, "success", "プレイリストに追加");
          },
        })),
        {
          label: "＋ New catalogue playlist",
          jp: "新規",
          run: () => {
            const p = useCataloguePlaylists.getState().create("New Playlist");
            if (p) for (const t of album.tracks) useCataloguePlaylists.getState().addTrack(p.id, t.path);
            toast("Catalogue playlist created", "success", "プレイリストを作成");
          },
        },
        { divider: true, label: "" },
        {
          label: "Delete album from catalogue",
          jp: "カタログから削除",
          danger: true,
          run: () => {
            void (async () => {
              if (
                !(await confirm({
                  title: `DELETE ${album.name} FROM THE CATALOGUE?`,
                  body: `${album.tracks.length} tracks disappear for every listener of this server.`,
                  danger: true,
                }))
              )
                return;
              try {
                const n = await deleteCatalogueTracks(album.tracks.map((t) => t.path));
                await useCatalogue.getState().refresh();
                toast(n > 0 ? `Deleted ${album.name} from catalogue` : "Catalogue delete failed", n > 0 ? "info" : "error", "削除済み");
              } catch {
                toast("Catalogue delete failed", "error", "削除失敗");
              }
            })();
          },
        },
      );
    }
  } else {
    items.push({ divider: true, label: "" });
    items.push(
      ...getCachedPlaylists().map((pl) => ({
        label: `＋ ${pl.name}`,
        jp: "追加",
        run: () => {
          void addToPlaylist(pl.id!, album.tracks.map((t) => t.id)).then(() =>
            toast(`Album added to ${pl.name}`, "success", "プレイリストに追加"),
          );
        },
      })),
    );
    if (cloudConfigured()) {
      items.push({ divider: true, label: "" });
      items.push({
        label: "Upload album to cloud",
        jp: "クラウドへ",
        run: () => {
          void (async () => {
            toast(`Uploading ${album.name}…`, "info", "アップロード");
            try {
              const r = await uploadTracks(album.tracks, resolveSourceFile, undefined, async (k) => (await db.covers.get(k))?.blob ?? null);
              await useCloud.getState().refresh();
              toast(
                r.failed
                  ? `Uploaded with ${r.failed} failures`
                  : r.manifestWritten
                    ? `Uploaded ${album.name}`
                    : `Uploaded ${album.name}, cloud list unreachable: retry later`,
                r.failed || !r.manifestWritten ? "error" : "success",
                "クラウド",
              );
            } catch {
              toast("Upload failed", "error", "アップロード失敗");
            }
          })();
        },
      });
    }
    items.push({ divider: true, label: "" });
    items.push({
      label: "Delete album from library",
      jp: "アルバムを削除",
      danger: true,
      run: () => {
        void (async () => {
          if (
            !(await confirm({
              title: `DELETE ${album.name}?`,
              body: `${album.tracks.length} tracks leave your library (files on disk stay).`,
              danger: true,
            }))
          )
            return;
          void deleteFromLibrary(album.tracks.map((t) => t.path)).then((n) => {
            if (n > 0) toast(`Deleted ${album.name} (${n} tracks)`, "info", "削除済み");
          });
        })();
      },
    });
  }
  showContextMenu(e, items);
}

// ---- playlists, the sidebar rail, and app-wide fallbacks -------------------

/** Resolve a playlist's tracks (kept in playlist order) and start playback. */
async function playPlaylist(id: number, shuffle: boolean) {
  const pl = getCachedPlaylists().find((p) => p.id === id);
  if (!pl || pl.trackIds.length === 0) {
    toast("Playlist is empty", "error", "空のプレイリスト");
    return;
  }
  const rows = await db.tracks.bulkGet(pl.trackIds);
  const byId = new Map(rows.filter((t) => !!t).map((t) => [t!.id, t!]));
  const tracks = pl.trackIds.map((i) => byId.get(i)).filter((t): t is TrackMeta => !!t);
  if (tracks.length === 0) {
    toast("Playlist tracks are no longer in the library", "error", "再生できません");
    return;
  }
  const pb = usePlayback.getState();
  if (shuffle !== engine.shuffle) pb.toggleShuffle();
  pb.playQueue(tracks, 0);
}

/** Pick a new picture for a playlist from the user's files. */
function pickPlaylistPicture(id: number) {
  pickFile("image/*", (f) => {
    if (!f.type.startsWith("image/")) return;
    void db.playlists.update(id, { pic: f }).then(() =>
      toast("Playlist picture updated", "success", "カバー更新"),
    );
  });
}

/**
 * Right-click menu for a playlist: shared by the sidebar rail and the
 * library pane. Surfaces with their own editors (the pane's inline rename)
 * swap them in via `overrides`.
 */
export function showPlaylistMenu(
  e: MouseEventLike,
  playlist: Playlist,
  overrides: { onRename?: () => void; onDelete?: () => void } = {},
) {
  e.preventDefault();
  e.stopPropagation();
  const id = playlist.id!;
  const pinned = useUi.getState().pinnedPlaylists.includes(id);
  const items: ContextMenuItem[] = [
    { label: "Play playlist", jp: "再生", run: () => void playPlaylist(id, false) },
    { label: "Shuffle playlist", jp: "シャッフル", run: () => void playPlaylist(id, true) },
    { divider: true, label: "" },
    {
      label: pinned ? "Unpin from sidebar" : "Pin to sidebar",
      jp: "ピン",
      run: () => useUi.getState().togglePinnedPlaylist(id),
    },
    { label: "Edit picture", jp: "カバー", run: () => pickPlaylistPicture(id) },
    {
      label: "Rename",
      jp: "名前変更",
      run: () => {
        if (overrides.onRename) overrides.onRename();
        else useUi.getState().setPlaylistRename(id);
      },
    },
    { divider: true, label: "" },
    {
      label: "Delete playlist",
      jp: "削除",
      danger: true,
      run: () => {
        void (async () => {
          if (!(await confirm({ title: `DELETE ${playlist.name}?`, danger: true }))) return;
          if (overrides.onDelete) {
            overrides.onDelete();
            return;
          }
          void deletePlaylist(id).then(() => toast(`Deleted ${playlist.name}`, "info", "削除済み"));
        })();
      },
    },
  ];
  showContextMenu(e, items);
}

/** Standalone folder import for menus: same pipeline as the screens' button,
 *  toasts instead of the progress panel. */
export async function importMusicFromMenu(): Promise<void> {
  const { inTauriShell, tauriImportFolder } = await import("@/core/library/shellIngest");
  const result = inTauriShell()
    ? await tauriImportFolder()
    : await (async () => {
        const { pickDirectory, importFromDirectory } = await import("@/core/library/importService");
        const dir = await pickDirectory();
        return dir ? importFromDirectory(dir) : null;
      })();
  if (!result) return; // user cancelled the picker
  const bits = [`${result.added} added`, `${result.updated} updated`];
  if (result.skipped) bits.push(`${result.skipped} skipped`);
  if (result.failed) bits.push(`${result.failed} failed`);
  toast(`Import complete: ${bits.join(" · ")}`, result.failed ? "error" : "success", "取り込み完了");
}

/** Right-click on the sidebar rail itself: playlist management quick actions. */
export function showSidebarMenu(e: MouseEventLike) {
  e.preventDefault();
  e.stopPropagation();
  showContextMenu(e, [
    { label: "New playlist", jp: "新規", run: () => useUi.getState().setPlaylistCreate({}) },
    { label: "Import music folder", jp: "取り込み", run: () => void importMusicFromMenu() },
    { divider: true, label: "" },
    { label: "Open library", jp: "ライブラリ", run: () => useUi.getState().navigate("library") },
  ]);
}

/** Fallback for surfaces without a specific menu: every right-click stays
 *  custom. The playlist action follows the screen you are on, so creating
 *  from the catalogue/cloud never lands in the wrong playlist list. */
export function showShellMenu(e: MouseEventLike) {
  const view = useUi.getState().view;
  const items: ContextMenuItem[] = [];
  if (view === "catalogue") {
    if (isAdminUser()) {
      items.push({
        label: "New catalogue playlist",
        jp: "新規",
        run: () => {
          useCataloguePlaylists.getState().create("New Playlist");
          toast("Catalogue playlist created", "success", "プレイリストを作成");
        },
      });
    }
  } else if (view === "cloud") {
    items.push({
      label: "New cloud playlist",
      jp: "新規",
      run: () => {
        useCloudPlaylists.getState().create("New Playlist");
        toast("Cloud playlist created", "success", "プレイリストを作成");
      },
    });
  } else {
    items.push({ label: "New playlist", jp: "新規", run: () => useUi.getState().setPlaylistCreate({}) });
  }
  items.push(
    { divider: true, label: "" },
    { label: "Library", jp: "ライブラリ", run: () => useUi.getState().navigate("library") },
    { label: "Settings", jp: "設定", run: () => useUi.getState().navigate("settings") },
  );
  showContextMenu(e, items);
}

const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", "number"]);

/** Right-click inside a text field: clipboard actions, since the native
 *  menu is suppressed app-wide. */
export function showEditMenu(e: MouseEventLike, field: HTMLInputElement | HTMLTextAreaElement) {
  e.preventDefault();
  e.stopPropagation();
  const hasSelection = (field.selectionEnd ?? 0) > (field.selectionStart ?? 0);
  const hasText = field.value.length > 0;
  const items: ContextMenuItem[] = [];
  if (hasSelection) {
    items.push(
      { label: "Cut", jp: "切り取り", run: () => document.execCommand("cut") },
      { label: "Copy", jp: "コピー", run: () => document.execCommand("copy") },
    );
  }
  items.push({
    label: "Paste",
    jp: "貼り付け",
    run: () => {
      navigator.clipboard
        .readText()
        .then((t) => document.execCommand("insertText", false, t))
        .catch(() => toast("Clipboard unavailable", "error", "クリップボード"));
    },
  });
  if (hasText) items.push({ label: "Select all", jp: "全選択", run: () => field.select() });
  showContextMenu(e, items);
}

/** Is this element a text-entry field an edit menu makes sense for? */
export function editableTarget(t: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  if (!(t instanceof Element)) return null;
  const el = t.closest("textarea, input, [contenteditable=''], [contenteditable='true']");
  if (!(el instanceof HTMLElement)) return null;
  if (el instanceof HTMLTextAreaElement || el.isContentEditable) return el as HTMLTextAreaElement;
  if (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type)) return el;
  return null;
}
