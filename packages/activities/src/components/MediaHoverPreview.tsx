/**
 * MediaHoverPreview — the image, as large as the viewport allows, floated over
 * the page while the thumbnail is hovered. Portaled to `body` so no
 * `overflow-hidden` ancestor clips it, fixed so nothing reflows, and it lets
 * every pointer event through: covering the thumbnail must not close it.
 *
 * The one thing that does take the pointer is the switch on the frame's
 * corner — the learner who dislikes the preview looks for the way out on the
 * thing they are looking at.
 */
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { fitPreview, isWorthPreviewing, type Size } from '../internal/mediaPreviewFit.js';
import { MediaHoverToggle } from './MediaHoverToggle.js';

function viewportSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function MediaHoverPreview({
  src,
  open,
  rendered,
  onDisable,
  switchRef,
}: {
  src: string;
  open: boolean;
  /** The thumbnail as drawn; a preview that is not clearly larger stays closed. */
  rendered: Size | null;
  onDisable: () => void;
  switchRef: RefObject<HTMLButtonElement | null>;
}) {
  const reduced = useReducedMotion();
  const [natural, setNatural] = useState<Size | null>(null);
  const [viewport, setViewport] = useState<Size | null>(null);

  useEffect(() => {
    if (!open) return;
    const update = () => setViewport(viewportSize());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  const size = natural && viewport ? fitPreview(natural, viewport) : null;
  if (size && !isWorthPreviewing(size, rendered)) return null;

  return createPortal(
    <motion.div
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/55"
      data-testid="media-hover-preview"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: size ? 1 : 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="relative"
        style={size ? undefined : { visibility: 'hidden' }}
        initial={reduced ? false : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <div
          className="overflow-hidden rounded-2xl border border-border bg-obsidiana shadow-2xl shadow-black/70 ring-1 ring-menta/40"
          style={size ? { width: size.width, height: size.height } : undefined}
          aria-hidden="true"
        >
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={(event) =>
              setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
            }
            className="block h-full w-full object-contain"
          />
        </div>
        <MediaHoverToggle
          ref={switchRef}
          enabled
          onChange={onDisable}
          testId="media-hover-preview-toggle"
          className="pointer-events-auto absolute -right-3 -top-3 h-8 w-8 opacity-80 shadow-lg shadow-black/60 hover:opacity-100"
        />
      </motion.div>
    </motion.div>,
    document.body,
  );
}
