import { useState, type ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { ArtViewer, type ArtViewerArt } from './ArtViewer';

interface Props extends ArtViewerArt {
  /** The art as it sits on the page; it becomes the button that opens the viewer. Without it, only the corner key is drawn. */
  children?: ReactNode;
  /** What the viewer shows when it differs from the page's own drawing (an SVG component, a larger image). */
  full?: ReactNode;
  className?: string;
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]';
const BADGE = 'flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#2E2A25] bg-[#0A0908]/85 text-[#F4EDE2]';

function Glyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 2h4v4M6 14H2v-4M14 2 9.5 6.5M2 14l4.5-4.5" />
    </svg>
  );
}

/** Opens the full-screen viewer for one art: wrap the art, or drop it bare as a corner key over a card. */
export function ArtZoom({ children, full, className = '', ...art }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const label = `${t('viewer.open')}: ${art.title}`;

  return (
    <>
      {children ? (
        <button type="button" onClick={() => setOpen(true)} aria-label={label} data-testid="art-zoom" className={`group relative block max-w-full cursor-zoom-in rounded-2xl text-left ${FOCUS} ${className}`}>
          {children}
          <span className={`${BADGE} absolute right-2 top-2 opacity-80 transition-opacity group-hover:opacity-100`}>
            <Glyph />
          </span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label={label} title={label} data-testid="art-zoom" className={`${BADGE} h-11 w-11 hover:border-[#5E574E] ${FOCUS} ${className}`}>
          <Glyph />
        </button>
      )}
      {open && (
        <ArtViewer {...art} onClose={() => setOpen(false)}>
          {full}
        </ArtViewer>
      )}
    </>
  );
}
