/**
 * MediaHoverZone — wraps an image card with the hover preview and its switch.
 * The card keeps its own click (lightbox); hovering it opens the preview,
 * leaving or pressing closes it. It is off until the learner turns the switch on,
 * and the first image of a fresh browser carries a one-time balloon about it.
 * On a touch screen nothing is added.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { Size } from '../internal/mediaPreviewFit.js';
import { MediaHoverPreview } from './MediaHoverPreview.js';
import { MediaHoverCoach } from './MediaHoverCoach.js';
import { MediaHoverToggle } from './MediaHoverToggle.js';
import { useMediaHoverCoach } from './useMediaHoverCoach.js';
import { useMediaHoverPreview } from './useMediaHoverPreview.js';

const THUMB_SWITCH = 'absolute right-2 top-2 z-10 h-7 w-7';
/** Room a host's fixed bottom bar (the lesson's Continue) takes: the tip never shows under it. */
const BOTTOM_BAR_RESERVE_PX = 112;

/** True once most of the zone is on screen above the bottom bar. Without an observer (tests, old browsers): true. */
function useClearOfBottomBar(ref: RefObject<HTMLElement | null>): boolean {
  const [clear, setClear] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setClear(entry.intersectionRatio >= 0.6), {
      rootMargin: `0px 0px -${BOTTOM_BAR_RESERVE_PX}px 0px`,
      threshold: [0, 0.6, 1],
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return clear;
}

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
  const zoneRef = useRef<HTMLDivElement>(null);
  const inView = useClearOfBottomBar(zoneRef);
  const coach = useMediaHoverCoach(finePointer, enabled, inView);

  return (
    <div
      ref={zoneRef}
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
          onChange={(next) => {
            coach.dismiss();
            setEnabled(next);
          }}
          className={`${THUMB_SWITCH} ${
            enabled ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'opacity-100'
          } ${toggleClassName}`}
        />
      )}
      {coach.visible && <MediaHoverCoach onDismiss={coach.dismiss} />}
      <MediaHoverPreview src={src} open={open} rendered={rendered} onDisable={disable} switchRef={switchRef} />
    </div>
  );
}
