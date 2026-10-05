import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { MediaKind } from '../internal/richText.js';

export const LIGHTBOX_ZOOM_FACTOR = 2.5;

const CONTROL =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-obsidiana/90 px-4 text-sm text-foreground';

// Top padding leaves room for the controls, so the fitted media never sits under them.
const FRAME =
  'fixed inset-0 z-50 flex h-[100dvh] overflow-auto overscroll-contain bg-black touch-pan-x touch-pan-y touch-pinch-zoom pt-[calc(env(safe-area-inset-top)+4.5rem)] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]';

const FITTED = 'm-auto min-h-0 min-w-0 max-h-full max-w-full object-contain';

/**
 * Full-screen viewer for a lesson image or clip. It opens with the whole media
 * inside the visible viewport; the zoom control (or a double tap) enlarges an
 * image and the frame then pans by scrolling. Escape, the close control or a
 * press outside the media closes it.
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
  const [zoomed, setZoomed] = useState<{ width: number; height: number } | null>(null);

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
    frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2;
    frame.scrollTop = (frame.scrollHeight - frame.clientHeight) / 2;
  }, [zoomed]);

  function toggleZoom() {
    if (zoomed) return setZoomed(null);
    const box = imageRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setZoomed({ width: box.width * LIGHTBOX_ZOOM_FACTOR, height: box.height * LIGHTBOX_ZOOM_FACTOR });
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
      onClick={onClose}
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
