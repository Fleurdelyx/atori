import { useAuth } from "@/core/auth/authStore";

/**
 * RemoteDownload: asks the worker (accounts mode) to download a media URL
 * server-side and store it in the signed-in user's cloud library. Works from
 * any device: no local yt-dlp needed. Requires DL_BASE configured on the
 * worker (a Cobalt-compatible downloader API).
 */

export interface RemoteDownloadResult {
  ok: true;
  key: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  ext: string;
}

/** target format for a remote download; "best" keeps the source codec */
export type DownloadFormat = "best" | "mp3" | "opus" | "wav" | "mp4";

export async function remoteDownload(url: string, format: DownloadFormat = "best"): Promise<RemoteDownloadResult> {
  const a = useAuth.getState();
  if (!a.serverUrl || !a.sessionToken) throw new Error("Sign in to use cloud downloads");
  const res = await fetch(`${a.serverUrl.replace(/\/+$/, "")}/api/library/remote-download`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.sessionToken}` },
    body: JSON.stringify({
      url,
      downloadMode: format === "mp4" ? "auto" : "audio",
      ...(format !== "best" && format !== "mp4" ? { audioFormat: format } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<RemoteDownloadResult> & {
    error?: string;
    message?: string;
  };
  if (!res.ok || !data.key) {
    throw new Error(data.message ?? data.error ?? `download failed (${res.status})`);
  }
  return data as RemoteDownloadResult;
}

/** probe a stream URL's duration by loading its metadata in a detached element */
export function probeDuration(url: string, timeoutMs = 6000): Promise<number | null> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    let done = false;
    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      a.removeAttribute("src");
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    a.addEventListener("loadedmetadata", () => {
      clearTimeout(timer);
      finish(Number.isFinite(a.duration) ? a.duration : null);
    });
    a.addEventListener("error", () => {
      clearTimeout(timer);
      finish(null);
    });
    a.src = url;
  });
}

/** upload a cover blob into the user's cloud namespace (best-effort caller) */
export async function uploadCover(coverKey: string, blob: Blob): Promise<void> {
  const a = useAuth.getState();
  if (!a.serverUrl || !a.sessionToken) return;
  await fetch(`${a.serverUrl.replace(/\/+$/, "")}/api/library/upload/cover/${coverKey}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${a.sessionToken}`, "Content-Type": blob.type || "image/jpeg" },
    body: blob,
  });
}
