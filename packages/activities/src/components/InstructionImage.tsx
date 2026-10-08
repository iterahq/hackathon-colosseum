import { useEffect, useRef, useState } from 'react';
import { useActivityI18n } from '../context.js';
import { MEDIA_LIFT } from './mediaLift.js';
import { MediaHoverZone } from './MediaHoverZone.js';
import { MediaLightbox } from './MediaLightbox.js';

export function InstructionImage({ src, alt }: { src: string; alt: string }) {
  const { t } = useActivityI18n();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  // An image already in the cache can finish before its `load` listener is heard:
  // without this check it would stay hidden behind the skeleton.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) setLoaded(true);
  }, [src]);

  // A file that did not arrive must not pulse forever: the description takes its place.
  if (failed) {
    return (
      <p className="rounded-2xl border border-border bg-obsidiana/60 p-4 text-sm text-muted-foreground" data-testid="instruction-image-failed">
        {alt}
      </p>
    );
  }

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
          ref={imageRef}
          src={src}
          alt={alt}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
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
