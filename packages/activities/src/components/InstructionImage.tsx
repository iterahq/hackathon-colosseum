import { useEffect, useState } from 'react';
import { useActivityI18n } from '../context.js';
import { MEDIA_LIFT } from './mediaLift.js';
import { MediaHoverZone } from './MediaHoverZone.js';

export function InstructionImage({ src, alt }: { src: string; alt: string }) {
  const { t } = useActivityI18n();
  const [loaded, setLoaded] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

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
          className={`w-full h-auto max-h-64 md:max-h-96 object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
        {loaded && (
          <span className="absolute bottom-2 right-2 rounded-full bg-obsidiana/90 px-3 py-1 text-xs text-muted-foreground">
            {t('activity.instructionZoomOpen')}
          </span>
        )}
      </button>
      </MediaHoverZone>

      {zoomed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setZoomed(false)}
          className="fixed inset-0 z-50 flex items-center overflow-auto bg-black/95 p-4"
          data-testid="instruction-image-zoom"
        >
          {/* Ilustração larga em tela estreita: forçar uma largura mínima e deixar
              rolar na horizontal é o que mantém o texto do diagrama legível. */}
          <img src={src} alt={alt} className="min-w-[860px] w-full max-w-none h-auto" />
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label={t('activity.instructionZoomClose')}
            className="fixed top-4 right-4 rounded-full border border-border bg-obsidiana/90 px-4 py-2 text-sm text-foreground"
            data-testid="instruction-image-zoom-close"
          >
            {t('activity.instructionZoomClose')}
          </button>
        </div>
      )}
    </>
  );
}
