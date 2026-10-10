import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'framer-motion';
import { useI18n } from '@/i18n';
import { addressUrl } from '@/lib/explorer';
import { MAX_ZOOM, MIN_ZOOM } from './artViewerMath';
import { trapTab } from './focusTrap';
import { useArtView } from './useArtView';

export interface ArtViewerArt {
  /** Name of the art: a certification, a medal, an avatar. */
  title: string;
  /** One line under the title. */
  line?: string | null;
  /** A longer text shown under the line (the story of an avatar). */
  story?: string | null;
  /** On-chain asset: adds the explorer link. */
  asset?: string | null;
  explorerUrl?: string | null;
  /** Image address; `children` wins when both are given. */
  src?: string | null;
  /** Width / height of the art, for `children` or until the image has loaded. */
  aspect?: number;
  /** Round arts (avatars) are clipped to a circle. */
  round?: boolean;
}

interface Props extends ArtViewerArt {
  onClose: () => void;
  /** The art as a component (an SVG drawn by the client) instead of an image. */
  children?: ReactNode;
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]';
const KEY = `inline-flex h-11 min-w-11 items-center justify-center rounded-[10px] border-2 border-b-4 border-[#2E2A25] bg-[#141210] px-3 [font:700_16px_JetBrains_Mono] text-[#F4EDE2] hover:border-[#5E574E] disabled:opacity-40 ${FOCUS}`;

/** Full-screen lightbox for one piece of art: fit, zoom (wheel, pinch, buttons, keys), pan, Esc or backdrop to close. */
export function ArtViewer({ title, line, story, asset, explorerUrl, src, aspect = 1, round = false, onClose, children }: Props) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [natural, setNatural] = useState<number | null>(null);
  const { stageRef, view, fit, ready, zoomIn, zoomOut, toggle, reset, onKey, handlers } = useArtView(children ? aspect : (natural ?? aspect));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const moved = useRef(false);
  const link = explorerUrl ?? (asset ? addressUrl(asset) : null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        return onClose();
      }
      if (e.key === 'Tab') return trapTab(e, rootRef.current);
      if (onKey(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, onKey]);

  return createPortal(
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label={title} data-testid="art-viewer" data-zoom={view.zoom.toFixed(2)} className="fixed inset-0 z-[90] flex flex-col bg-[#0A0908]/95 text-[#F4EDE2] backdrop-blur-sm">
      <div className="flex flex-none items-center justify-between gap-3 px-4 pt-3 sm:px-6">
        <div className="flex items-center gap-2" role="group" aria-label={t('viewer.zoom')}>
          <button type="button" onClick={zoomOut} disabled={view.zoom <= MIN_ZOOM} aria-label={t('viewer.zoomOut')} data-testid="art-viewer-out" className={KEY}>−</button>
          <button type="button" onClick={reset} aria-label={t('viewer.fit')} data-testid="art-viewer-fit" className={`${KEY} tabular-nums`}>{Math.round(view.zoom * 100)}%</button>
          <button type="button" onClick={zoomIn} disabled={view.zoom >= MAX_ZOOM} aria-label={t('viewer.zoomIn')} data-testid="art-viewer-in" className={KEY}>+</button>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} data-testid="art-viewer-close" className={KEY}>
          {t('viewer.close')} <span aria-hidden className="ml-2">✕</span>
        </button>
      </div>
      <div
        ref={stageRef}
        data-testid="art-viewer-stage"
        className={`relative m-3 min-h-0 flex-1 touch-none select-none overflow-hidden sm:m-5 ${view.zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
        {...handlers}
        onPointerDown={(e) => ((moved.current = false), handlers.onPointerDown(e))}
        onPointerMove={(e) => ((moved.current = moved.current || e.buttons > 0), handlers.onPointerMove(e))}
        onClick={(e) => e.target === e.currentTarget && !moved.current && onClose()}
        onDoubleClick={toggle}
      >
        <div
          className={`absolute left-1/2 top-1/2 ${round ? 'overflow-hidden rounded-full' : ''} [&>*]:block [&>*]:h-full [&>*]:w-full [&>svg]:max-w-none`}
          style={{
            width: fit.width * view.zoom,
            height: fit.height * view.zoom,
            transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
            transition: reduced ? 'none' : 'width 140ms ease-out, height 140ms ease-out',
            visibility: ready ? 'visible' : 'hidden',
          }}
        >
          {children ?? (src ? <img src={src} alt={title} draggable={false} onLoad={(e) => setNatural(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))} className="object-contain" /> : null)}
        </div>
      </div>
      <div className="flex flex-none flex-col items-center gap-1 px-4 pb-[max(16px,env(safe-area-inset-bottom))] text-center">
        <h2 className="[font:700_28px/1.05_'Barlow_Condensed']" data-testid="art-viewer-title">{title}</h2>
        {line && <p className="max-w-[560px] [font:500_14px/1.4_Inter] text-[#C9BFB0]">{line}</p>}
        {story && <p className="max-h-[22vh] max-w-[560px] overflow-y-auto [font:400_14px/1.5_Inter] text-[#A0978A]" data-testid="art-viewer-story">{story}</p>}
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" data-testid="art-viewer-explorer" className={`mt-1 inline-flex min-h-11 items-center rounded [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`}>
            {t('viewer.explorer')} ↗
          </a>
        )}
      </div>
    </div>,
    document.body
  );
}
