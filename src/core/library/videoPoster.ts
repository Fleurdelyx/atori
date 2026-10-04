/**
 * Video poster frames: downloaded video files ship without embedded art, so a
 * frame grabbed a few seconds in stands in as the cover. Runs on the main
 * thread (hidden <video> → seek → canvas → JPEG); the metadata worker can't
 * decode video frames.
 */

const POSTER_TIMEOUT_MS = 6000;
const MAX_EDGE = 640;

/** Grab a poster frame from a media URL. Resolves null on any failure:
 *  posters are decorative, never worth erroring an import over. */
export function capturePosterFromUrl(url: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const video = document.createElement("video");
    let done = false;

    const finish = (blob: Blob | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // release the decoder instead of waiting for GC
      video.removeAttribute("src");
      video.load();
      resolve(blob);
    };

    const fail = () => finish(null);
    const timer = setTimeout(fail, POSTER_TIMEOUT_MS);

    video.muted = true;
    video.preload = "auto";
    video.onerror = fail;
    video.onloadedmetadata = () => {
      // a little way in to skip black lead-in frames
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = Math.min(5, d > 0 ? d * 0.25 : 2);
    };
    video.onseeked = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return fail();
        const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return fail();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), "image/jpeg", 0.82);
      } catch {
        fail();
      }
    };
    video.src = url;
  });
}

/** Poster from a File: manages its own object URL. */
export async function captureVideoPoster(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    return await capturePosterFromUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
