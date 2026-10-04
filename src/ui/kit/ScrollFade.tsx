import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const IDLE_MS = 1800; // fade the thumb out after this much scroll inactivity

/**
 * ScrollFade: a vertical scroll container whose scrollbar fades out after a
 * moment of inactivity. The native bar is hidden and an overlay thumb is
 * painted instead: Chromium's scrollbar-color transitions are discrete (they
 * snap, never interpolate), so a real fade needs a real element. Native
 * wheel/touch/keyboard scrolling is untouched; the right-edge strip reveals
 * the bar on hover and supports jump + drag while it's visible.
 *
 * The strip lives INSIDE the scroller (absolute children scroll with the
 * content) and cancels that by translating itself by scrollTop on every
 * paint: same rAF as the thumb, so they never drift.
 */
export function ScrollFade({ className = "", ref, children, ...rest }: React.ComponentProps<"div">) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const raf = useRef(0);

  const paint = useCallback(() => {
    const box = boxRef.current;
    const strip = stripRef.current;
    const thumb = strip?.firstElementChild as HTMLElement | null;
    if (!box || !strip || !thumb) return;
    const { clientHeight, scrollHeight, scrollTop } = box;
    const fits = scrollHeight <= clientHeight + 1;
    const h = fits ? 0 : Math.max(32, Math.round((clientHeight / scrollHeight) * clientHeight));
    const y = fits ? 0 : Math.round((scrollTop / (scrollHeight - clientHeight || 1)) * (clientHeight - h));
    thumb.style.height = `${h}px`;
    thumb.style.transform = `translateY(${y}px)`;
    strip.style.height = `${fits ? 0 : clientHeight}px`;
    strip.style.transform = `translateY(${scrollTop}px)`;
    strip.toggleAttribute("data-fits", fits);  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      // stay up while the pointer is on the strip
      if (!stripRef.current?.hasAttribute("data-hover")) stripRef.current?.removeAttribute("data-active");
    }, IDLE_MS);
  }, []);

  const wake = useCallback(() => {
    stripRef.current?.setAttribute("data-active", "");
    scheduleHide();
  }, [scheduleHide]);

  useLayoutEffect(() => {
    paint();
  });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onScroll = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        paint();
        wake();
      });
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => paint());
    ro.observe(box);
    if (box.firstElementChild) ro.observe(box.firstElementChild);
    return () => {
      box.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, [paint, wake]);

  // hovering the right edge reveals the strip: it stays pointer-events:none
  // while hidden so idle content near the edge keeps its own hit area
  const onPointerMove = (e: React.PointerEvent) => {
    const box = boxRef.current;
    const strip = stripRef.current;
    if (!box || !strip || strip.hasAttribute("data-fits")) return;
    const near = e.clientX >= box.getBoundingClientRect().right - 14;
    if (near) {
      wake();
      strip.setAttribute("data-hover", "");
    } else if (strip.hasAttribute("data-hover")) {
      strip.removeAttribute("data-hover");
      scheduleHide();
    }
  };

  const onStripPointerDown = (e: React.PointerEvent) => {
    const box = boxRef.current;
    const strip = stripRef.current;
    if (!box || !strip || e.button !== 0) return;
    e.preventDefault();
    const rect = strip.getBoundingClientRect();
    const thumbH = Math.max(32, Math.round((box.clientHeight / box.scrollHeight) * rect.height));
    const scrollTo = (clientY: number) => {
      const p = Math.max(0, Math.min(1, (clientY - rect.top - thumbH / 2) / (rect.height - thumbH || 1)));
      box.scrollTop = Math.round(p * (box.scrollHeight - box.clientHeight));
    };
    scrollTo(e.clientY);
    strip.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => scrollTo(ev.clientY);
    const up = () => {
      strip.removeEventListener("pointermove", move);
      strip.removeEventListener("pointerup", up);
      strip.removeEventListener("pointercancel", up);
    };
    strip.addEventListener("pointermove", move);
    strip.addEventListener("pointerup", up);
    strip.addEventListener("pointercancel", up);
    wake();
  };

  return (
    <div
      {...rest}
      ref={(el) => {
        boxRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      className={`scroll-fade ${className}`}
      onPointerMove={(e) => {
        rest.onPointerMove?.(e);
        onPointerMove(e);
      }}
    >
      {children}
      <div
        ref={stripRef}
        className="fade-sb-strip"
        onPointerDown={onStripPointerDown}
        onPointerEnter={() => {
          stripRef.current?.setAttribute("data-hover", "");
          wake();
        }}
        onPointerLeave={() => {
          stripRef.current?.removeAttribute("data-hover");
          scheduleHide();
        }}
      >
        <div className="fade-sb-thumb" />
      </div>
    </div>
  );
}
