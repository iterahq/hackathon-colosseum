import { useEffect } from 'react';
import { useActivityI18n } from '../context.js';
import type { MediaKind } from '../internal/richText.js';

/** Full-screen viewer for an inline media item. Escape or a click outside closes it. */
export function MediaLightbox({
  src,
  kind,
  label,
  onClose,
  onError,
}: {
  src: string;
  kind: MediaKind;
  label: string;
  onClose: () => void;
  /** The video could not be played (broken link, unsupported codec). */
  onError?: () => void;
}) {
  const { t } = useActivityI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/95 p-4"
      data-testid="media-lightbox"
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
          className="max-h-full max-w-full"
        />
      ) : (
        <img src={src} alt={label} className="max-h-full max-w-full object-contain" />
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('activity.instructionZoomClose')}
        className="fixed top-4 right-4 rounded-full border border-border bg-obsidiana/90 px-4 py-2 text-sm text-foreground"
        data-testid="media-lightbox-close"
      >
        {t('activity.instructionZoomClose')}
      </button>
    </div>
  );
}
