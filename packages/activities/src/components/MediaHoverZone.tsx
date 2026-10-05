/**
 * MediaHoverZone — wraps an image card with the hover preview and its switch.
 * The card keeps its own click (lightbox); hovering it opens the preview,
 * leaving or pressing closes it. On a touch screen nothing is added.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Size } from '../internal/mediaPreviewFit.js';
import { MediaHoverPreview } from './MediaHoverPreview.js';
import { MediaHoverToggle } from './MediaHoverToggle.js';
import { useMediaHoverPreview } from './useMediaHoverPreview.js';

const THUMB_SWITCH = 'absolute right-2 top-2 z-10 h-7 w-7';

export function MediaHoverZone({
  src,
  className = '',
  toggleClassName = '',
  children,
}: {
  src: string;
  className?: string;
  /** Where the switch sits, when the card already has a control at the top-right. */
  toggleClassName?: string;
  children: ReactNode;
}) {
  const { enabled, setEnabled, disable, finePointer, open, handlers, thumbRef, switchRef } =
    useMediaHoverPreview();
  const [rendered, setRendered] = useState<Size | null>(null);

  return (
    <div
      className={`group relative ${className}`}
      data-testid="media-hover-zone"
      data-hover-preview={open ? 'open' : 'closed'}
    >
      <div
        ref={thumbRef}
        {...handlers}
        onPointerEnter={(event) => {
          const img = thumbRef.current?.querySelector('img');
          setRendered(img ? { width: img.clientWidth, height: img.clientHeight } : null);
          handlers.onPointerEnter(event);
        }}
      >
        {children}
      </div>
      {finePointer && (
        <MediaHoverToggle
          enabled={enabled}
          onChange={setEnabled}
          className={`${THUMB_SWITCH} ${
            enabled ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'opacity-60 group-hover:opacity-100'
          } ${toggleClassName}`}
        />
      )}
      <MediaHoverPreview src={src} open={open} rendered={rendered} onDisable={disable} switchRef={switchRef} />
    </div>
  );
}
