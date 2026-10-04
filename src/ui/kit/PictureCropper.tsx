import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, Crop, RotateCcw, X } from "lucide-react";

/**
 * PictureCropper: square-crop editor for playlist/cover pictures. Drag to
 * pan, wheel or slider to zoom (the image always covers the frame), then a
 * confirmation step previews the result before the caller receives the blob.
 * Portals to <body>: callers live inside clip-path containers, which would
 * clip a fixed-position modal.
 */
export function PictureCropper({
  file,
  title,
  onCancel,
  onConfirm,
}: {
  file: File | Blob;
  title: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const S = 512; // output resolution
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1); // ≥ 1, relative to the cover-fit scale
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const cropBlob = useRef<Blob | null>(null);
  // transform state lives in refs (redrawn imperatively) so panning never
  // re-renders; zoom/confirm are state for the slider + view switch
  const view = useRef({ scale: 1, dx: 0, dy: 0 }); // dx/dy = drawn-image top-left in canvas px

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      fit();
      setReady(true);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  /** cover-fit at the given zoom (1 = reset), centered; no gaps ever show */
  function fit(z = 1) {
    const img = imgRef.current;
    if (!img) return;
    const base = Math.max(S / img.naturalWidth, S / img.naturalHeight);
    view.current.scale = base * z;
    view.current.dx = (S - img.naturalWidth * view.current.scale) / 2;
    view.current.dy = (S - img.naturalHeight * view.current.scale) / 2;
    setZoom(z);
    draw();
  }

  function clamp() {
    const img = imgRef.current;
    if (!img) return;
    const v = view.current;
    const w = img.naturalWidth * v.scale;
    const h = img.naturalHeight * v.scale;
    v.dx = Math.min(0, Math.max(S - w, v.dx));
    v.dy = Math.min(0, Math.max(S - h, v.dy));
  }

  function draw() {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const v = view.current;
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(img, v.dx, v.dy, img.naturalWidth * v.scale, img.naturalHeight * v.scale);
  }

  function setZoomed(next: number, anchor?: { x: number; y: number }) {
    const img = imgRef.current;
    if (!img) return;
    const v = view.current;
    const prev = v.scale;
    const scale = Math.max(1, next);
    v.scale = Math.max(S / img.naturalWidth, S / img.naturalHeight) * scale;
    if (anchor) {
      // keep the canvas point under the cursor fixed while zooming
      v.dx = anchor.x - ((anchor.x - v.dx) * v.scale) / prev;
      v.dy = anchor.y - ((anchor.y - v.dy) * v.scale) / prev;
    }
    clamp();
    setZoom(scale);
    draw();
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    e.currentTarget.dataset.px = String(e.clientX);
    e.currentTarget.dataset.py = String(e.clientY);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragging) return;
    const v = view.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const k = S / rect.width;
    v.dx += (e.clientX - Number(e.currentTarget.dataset.px ?? e.clientX)) * k;
    v.dy += (e.clientY - Number(e.currentTarget.dataset.py ?? e.clientY)) * k;
    e.currentTarget.dataset.px = String(e.clientX);
    e.currentTarget.dataset.py = String(e.clientY);
    clamp();
    draw();
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const k = S / rect.width;
    setZoomed(zoom * Math.exp(-e.deltaY * 0.0015), { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k });
  }

  function apply() {
    const img = imgRef.current;
    if (!img) return;
    const out = document.createElement("canvas");
    out.width = S;
    out.height = S;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    const v = view.current;
    ctx.drawImage(img, v.dx, v.dy, img.naturalWidth * v.scale, img.naturalHeight * v.scale);
    const type = file instanceof File && file.type === "image/png" ? "image/png" : "image/jpeg";
    out.toBlob(
      (blob) => {
        if (!blob) return;
        cropBlob.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        setConfirming(true);
      },
      type,
      0.92,
    );
  }

  return createPortal(
    <AnimatePresence>
      {confirming ? (
        <motion.div
          key="crop-confirm"
          className="fixed inset-0 z-[80] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onPointerDown={onCancel}
        >
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ato-bg) 70%, transparent)" }} />
          <motion.div
            className="clip-notch relative w-[min(360px,92vw)] bg-panel p-5 backdrop-blur-xl"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
            initial={{ y: -14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="font-mono mb-4 text-[10px] tracking-[0.3em]" style={{ color: "var(--ato-accent)" }}>
              ▞ USE THIS PICTURE? <span className="font-jp text-dim">確認</span>
            </div>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Cropped preview"
                className="mx-auto mb-4 block h-40 w-40 object-cover"
                style={{ borderRadius: "var(--ato-radius)", border: "1px solid var(--ato-border)" }}
              />
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setConfirming(false);
                }}
                className="font-mono px-4 py-2 text-[10px] tracking-[0.25em] text-dim hover:text-accent"
              >
                BACK
              </button>
              <button
                onClick={() => {
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  if (cropBlob.current) onConfirm(cropBlob.current);
                }}
                className="clip-tag px-5 py-2"
                style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.3em]">CONFIRM</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          key="crop-editor"
          className="fixed inset-0 z-[80] flex items-start justify-center pt-[8vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onPointerDown={onCancel}
        >
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ato-bg) 62%, transparent)" }} />
          <motion.div
            className="clip-notch relative w-[min(480px,94vw)] bg-panel backdrop-blur-xl"
            style={{ border: "1px solid var(--ato-border)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="font-mono flex items-center gap-2 text-[10px] tracking-[0.3em]" style={{ color: "var(--ato-accent)" }}>
                <Crop className="h-3.5 w-3.5" /> ▞ CROP {title} <span className="font-jp text-dim">トリミング</span>
              </span>
              <button onClick={onCancel} className="text-dim hover:text-accent" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <canvas
                ref={canvasRef}
                width={S}
                height={S}
                className={`mx-auto block w-full max-w-[380px] cursor-grab touch-none select-none ${dragging ? "cursor-grabbing" : ""}`}
                style={{ borderRadius: "var(--ato-radius)", border: "1px solid var(--ato-border)" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => setDragging(false)}
                onPointerCancel={() => setDragging(false)}
                onWheel={onWheel}
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => fit()}
                  className="clip-tag p-1.5 text-dim hover:text-accent"
                  style={{ background: "color-mix(in srgb, var(--ato-text) 6%, transparent)" }}
                  title="Reset crop"
                  aria-label="Reset crop"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoomed(Number(e.target.value))}
                  className="flex-1 accent-[var(--ato-accent)]"
                  aria-label="Zoom"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
              <button onClick={onCancel} className="font-mono px-4 py-2 text-[10px] tracking-[0.25em] text-dim hover:text-accent">
                CANCEL
              </button>
              <button
                onClick={apply}
                disabled={!ready}
                className="clip-tag px-5 py-2 disabled:opacity-40"
                style={{ background: "var(--ato-accent)", color: "var(--ato-bg)" }}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.3em]">APPLY CROP</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
