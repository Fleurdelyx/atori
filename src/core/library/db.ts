import Dexie, { type EntityTable } from "dexie";
import type { TrackMeta } from "./types";

/** Stored file access: FS Access handle when available, else the File itself. */
export interface TrackSource {
  path: string; // pk — mirrors TrackMeta.path
  handle?: FileSystemFileHandle;
  file?: File;
}

export interface CoverBlob {
  key: string;
  blob: Blob;
}

export interface Playlist {
  id?: number;
  name: string;
  trackIds: number[];
  createdAt: number;
}

/** One "this track was played" event — powers Recently Played + Wrapped. */
export interface PlayEvent {
  id?: number;
  trackId: number;
  at: number;
}

/** Rule-based playlist that stays up to date with the library. */
export interface SmartPlaylist {
  id?: number;
  name: string;
  tag?: string;
  minYear?: number;
  maxYear?: number;
  minPlays?: number;
  createdAt: number;
}

/** A clip/gif attached to a track — plays beside the audio (canvas-style). */
export interface TrackVisual {
  trackId: number; // pk
  blob: Blob;
  mime: string;
  kind: "clip" | "gif";
  createdAt: number;
}

/** key-value store for things like root directory handles */
export interface MetaRow {
  key: string;
  value: unknown;
}

export const db = new Dexie("atori-library") as Dexie & {
  tracks: EntityTable<TrackMeta, "id">;
  sources: EntityTable<TrackSource, "path">;
  covers: EntityTable<CoverBlob, "key">;
  playlists: EntityTable<Playlist, "id">;
  plays: EntityTable<PlayEvent, "id">;
  smartPlaylists: EntityTable<SmartPlaylist, "id">;
  visuals: EntityTable<TrackVisual, "trackId">;
  meta: EntityTable<MetaRow, "key">;
};

db.version(1).stores({
  tracks: "id, path, album, albumArtist, artist, addedAt, lastPlayedAt, playCount, title",
  sources: "path",
  covers: "key",
  playlists: "++id, name",
});

db.version(2).stores({
  tracks: "id, path, album, albumArtist, artist, addedAt, lastPlayedAt, playCount, title",
  sources: "path",
  covers: "key",
  playlists: "++id, name",
  meta: "key",
});

db.version(3).stores({
  tracks: "id, path, album, albumArtist, artist, addedAt, lastPlayedAt, playCount, title",
  sources: "path",
  covers: "key",
  playlists: "++id, name",
  meta: "key",
  plays: "++id, trackId, at",
  smartPlaylists: "++id, name",
});

db.version(4).stores({
  tracks: "id, path, album, albumArtist, artist, addedAt, lastPlayedAt, playCount, title",
  sources: "path",
  covers: "key",
  playlists: "++id, name",
  meta: "key",
  plays: "++id, trackId, at",
  smartPlaylists: "++id, name",
  visuals: "trackId",
});
