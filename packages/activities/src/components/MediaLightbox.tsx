import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { MediaKind } from '../internal/richText.js';

export const LIGHTBOX_ZOOM_FACTOR = 2.5;
/** How far a pinch may enlarge the fitted image. */
export const LIGHTBOX_PINCH_MAX = 5;
// A pinch that ends this close to the fitted size snaps back to it.
const PINCH_SNAP = 1.05;
const PINCH_CLICK_GUARD_MS = 400;

type Size = { width: number; height: number };

const spread = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

const CONTROL =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-obsidiana/90 px-4 text-sm text-foreground';

// Top padding leaves room for the controls, so the fitted media never sits under them.
const FRAME =
  'fixed inset-0 z-50 flex h-[100dvh] overflow-auto overscroll-contain bg-black touch-pan-x touch-pan-y pt-[calc(env(safe-area-inset-top)+4.5rem)] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]';

const FITTED = 'm-auto min-h-0 min-w-0 max-h-full max-w-full object-contain';

/**
 * Full-screen viewer for a lesson image or clip. It opens with the whole media
 * inside the visible viewport; the zoom control, a double tap or a pinch
 * enlarges an image and the frame then pans by scrolling. Escape, the close
 * control or a press outside the media closes it.
 *
 * The pinch is handled here, not left to the browser: inside the native shell
 * the page viewport is locked (`user-scalable=no`), so a browser pinch does nothing.
 *
 * Portaled to `body`: an activity card is transformed while it animates in, and
 * a transformed ancestor turns `position: fixed` into "fixed to that card".
 */
export function MediaLightbox({
  src,
  kind,
  label,
  onClose,
  onError,
  testId = 'media-lightbox',
}: {
  src: string;
  kind: MediaKind;
  label: string;
  onClose: () => void;
  /** The video could not be played (broken link, unsupported codec). */
  onError?: () => void;
  testId?: string;
}) {
  const { t } = useActivityI18n();
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [zoomed, setZoomed] = useState<Size | null>(null);
  // The fitted size the current zoom started from.
  const fittedRef = useRef<Size | null>(null);
  // The image point (as a fraction of its box) a pinch keeps under the fingers.
  const focalRef = useRef<{ fx: number; fy: number; x: number; y: number } | null>(null);
  const pinchEndedAt = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const root = document.documentElement;
    const overflow = root.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || !zoomed) return;
    const focal = focalRef.current;
    const box = imageRef.current?.getBoundingClientRect();
    if (focal && box) {
      frame.scrollLeft += box.left + focal.fx * box.width - focal.x;
      frame.scrollTop += box.top + focal.fy * box.height - focal.y;
      return;
    }
    frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2;
    frame.scrollTop = (frame.scrollHeight - frame.clientHeight) / 2;
  }, [zoomed]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || kind !== 'image') return;
    let pinch: { spread: number; start: Size; fitted: Size } | null = null;
    let last: Size | null = null;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const box = imageRef.current?.getBoundingClientRect();
      const distance = spread(e.touches[0], e.touches[1]);
      if (!box || box.width === 0 || distance === 0) return;
      const start = { width: box.width, height: box.height };
      const fitted = fittedRef.current ?? start;
      fittedRef.current = fitted;
      const x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      focalRef.current = { fx: (x - box.left) / box.width, fy: (y - box.top) / box.height, x, y };
      pinch = { spread: distance, start, fitted };
      last = start;
    };
    const onMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      // Two fingers are a pinch here, not a scroll of the frame.
      if (e.cancelable) e.preventDefault();
      const wanted = (pinch.start.width * spread(e.touches[0], e.touches[1])) / pinch.spread;
      const width = Math.min(Math.max(wanted, pinch.fitted.width), pinch.fitted.width * LIGHTBOX_PINCH_MAX);
      last = { width, height: (width * pinch.fitted.height) / pinch.fitted.width };
      setZoomed(last);
    };
    const onEnd = (e: TouchEvent) => {
      if (!pinch || e.touches.length >= 2) return;
      const fitted = pinch.fitted;
      pinch = null;
      focalRef.current = null;
      pinchEndedAt.current = Date.now();
      if (last && last.width <= fitted.width * PINCH_SNAP) {
        fittedRef.current = null;
        setZoomed(null);
      }
    };

    frame.addEventListener('touchstart', onStart, { passive: true });
    // Not passive: the move must be able to stop the two-finger scroll.
    frame.addEventListener('touchmove', onMove, { passive: false });
    frame.addEventListener('touchend', onEnd);
    frame.addEventListener('touchcancel', onEnd);
    return () => {
      frame.removeEventListener('touchstart', onStart);
      frame.removeEventListener('touchmove', onMove);
      frame.removeEventListener('touchend', onEnd);
      frame.removeEventListener('touchcancel', onEnd);
    };
  }, [kind]);

  function toggleZoom() {
    focalRef.current = null;
    if (zoomed) {
      fittedRef.current = null;
      return setZoomed(null);
    }
    const box = imageRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    fittedRef.current = { width: box.width, height: box.height };
    setZoomed({ width: box.width * LIGHTBOX_ZOOM_FACTOR, height: box.height * LIGHTBOX_ZOOM_FACTOR });
  }

  // Fingers lifting off a pinch over the backdrop must not read as "close".
  function closeFromBackdrop() {
    if (Date.now() - pinchEndedAt.current > PINCH_CLICK_GUARD_MS) onClose();
  }

  function keepFocusInside(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const stops = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, video'));
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last) return;
    const leaving = event.shiftKey ? document.activeElement === first : document.activeElement === last;
    if (!leaving) return;
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={frameRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={closeFromBackdrop}
      onKeyDown={keepFocusInside}
      className={FRAME}
      data-testid={testId}
      data-zoomed={zoomed ? 'true' : 'false'}
    >
      {kind === 'video' ? (
        <video
          src={src}
          controls
          autoPlay
          loop
          playsInline
          onError={onError}
          onClick={(e) => e.stopPropagation()}
          className={FITTED}
        />
      ) : (
        <img
          ref={imageRef}
          src={src}
          alt={label}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={toggleZoom}
          className={zoomed ? 'm-auto max-w-none flex-none' : FITTED}
          style={zoomed ?? undefined}
          data-testid={`${testId}-media`}
        />
      )}
      <div
        className="fixed right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] flex gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {kind === 'image' && (
          <button
            type="button"
            onClick={toggleZoom}
            aria-label={t(zoomed ? 'activity.mediaZoomOut' : 'activity.mediaZoomIn')}
            aria-pressed={Boolean(zoomed)}
            className={CONTROL}
            data-testid={`${testId}-zoom`}
          >
            {zoomed ? <ZoomOut className="h-5 w-5" aria-hidden /> : <ZoomIn className="h-5 w-5" aria-hidden />}
          </button>
        )}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t('activity.instructionZoomClose')}
          className={CONTROL}
          data-testid={`${testId}-close`}
        >
          {t('activity.instructionZoomClose')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
