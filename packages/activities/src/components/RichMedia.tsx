/**
 * RichMedia — one `![caption](url)` figure inside concept text.
 *
 * A `.mp4`/`.webm` is a silent looping clip (a GIF that is not 4 MB): no
 * controls, autoplay, muted. Under prefers-reduced-motion it does not autoplay
 * and shows controls instead, with a separate expand button so the controls
 * keep their own clicks. Everything else is a lazy `<img>`.
 */
import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Maximize2 } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import { MEDIA_LIFT } from './mediaLift.js';
import { MediaLightbox } from './MediaLightbox.js';
import { RichSpans } from './RichSpans.js';
import { parseInline, type MediaItem } from '../internal/richText.js';

const CARD = `relative block w-full overflow-hidden rounded-2xl border border-border bg-obsidiana/60 ${MEDIA_LIFT}`;

export function RichMedia({ item }: { item: MediaItem }) {
  const { t } = useActivityI18n();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const plainCaption = item.caption.replace(/[*`=]/g, '');
  const label = plainCaption || t('activity.instructionZoomOpen');
  const controlled = item.kind === 'video' && Boolean(reduced);

  const media =
    item.kind === 'video' ? (
      <video
        src={item.url}
        className="h-auto w-full bg-black"
        muted
        loop
        playsInline
        preload="metadata"
        autoPlay={!reduced}
        controls={controlled}
        aria-label={label}
      />
    ) : (
      <img src={item.url} alt={plainCaption} loading="lazy" className="h-auto w-full object-contain" />
    );

  return (
    <figure className="m-0 space-y-2" data-testid="rich-media">
      {controlled ? (
        <div className={CARD}>
          {media}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t('activity.instructionZoomOpen')}
            className="absolute right-2 top-2 rounded-full bg-obsidiana/90 p-2 text-foreground"
          >
            <Maximize2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('activity.instructionZoomOpen')}
          className={`${CARD} cursor-zoom-in`}
        >
          {media}
        </button>
      )}
      {item.caption && (
        <figcaption className="text-sm text-muted-foreground">
          <RichSpans spans={parseInline(item.caption)} />
        </figcaption>
      )}
      {open && <MediaLightbox src={item.url} kind={item.kind} label={label} onClose={() => setOpen(false)} />}
    </figure>
  );
}
