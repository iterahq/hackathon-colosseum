import { useState } from 'react';
import { useActivityI18n } from '../context.js';
import { MEDIA_LIFT } from './mediaLift.js';
import { MediaHoverZone } from './MediaHoverZone.js';
import { MediaLightbox } from './MediaLightbox.js';

export function InstructionImage({ src, alt }: { src: string; alt: string }) {
  const { t } = useActivityI18n();
  const [loaded, setLoaded] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <MediaHoverZone src={src}>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        aria-label={t('activity.instructionZoomOpen')}
        className={`relative block w-full min-h-32 rounded-2xl border border-border bg-obsidiana/60 overflow-hidden cursor-zoom-in ${MEDIA_LIFT}`}
        data-testid="instruction-image"
      >
        {!loaded && (
          <div className="absolute inset-0 animate-pulse bg-muted-foreground/10" aria-hidden="true" data-testid="media-skeleton" />
        )}
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          className={`w-full h-auto max-h-[min(16rem,28dvh)] md:max-h-[min(24rem,28dvh)] object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
        {loaded && (
          <span className="absolute bottom-2 right-2 rounded-full bg-obsidiana/90 px-3 py-1 text-xs text-muted-foreground">
            {t('activity.instructionZoomOpen')}
          </span>
        )}
      </button>
      </MediaHoverZone>

      {zoomed && (
        <MediaLightbox src={src} kind="image" label={alt} onClose={() => setZoomed(false)} testId="instruction-image-zoom" />
      )}
    </>
  );
}
