/**
 * RichHeading — a section title with a tech accent: `##` carries an evergreen
 * bar that draws in under it once the block lands (and a mono section number
 * when the text has more than one section); `###` carries a tick at the left.
 *
 * Barlow Condensed stays here only: it reads as a label, and labels are short.
 */
import { useContext } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RichSpans } from './RichSpans.js';
import { BlockReveal } from './blockReveal.js';
import type { Inline } from '../internal/richText.js';

export function RichHeading({
  level,
  spans,
  muted,
  section,
}: {
  level: 2 | 3;
  spans: Inline[];
  muted: boolean;
  /** 1-based position among the `##` headings, when the text has more than one. */
  section?: number;
}) {
  const { landed, delay } = useContext(BlockReveal);
  const reduced = useReducedMotion();
  const tone = muted ? 'text-muted-foreground' : 'text-foreground';

  if (level === 3)
    return (
      <h3
        className={`flex items-baseline gap-2.5 font-display font-semibold ${
          muted ? 'text-base' : 'text-lg md:text-xl'
        } ${tone}`}
        data-rich-block="heading"
        data-level="3"
      >
        <span
          aria-hidden="true"
          className="inline-block h-[0.8em] w-1 shrink-0 translate-y-[0.08em] rounded-full bg-evergreen"
        />
        <span>
          <RichSpans spans={spans} />
        </span>
      </h3>
    );

  return (
    <h3
      className={`font-display font-bold leading-tight tracking-tight ${
        muted ? 'text-lg' : 'text-2xl md:text-[1.75rem]'
      } ${tone}`}
      data-rich-block="heading"
      data-level="2"
    >
      {section !== undefined && (
        <span
          className="mb-1 block font-mono text-xs font-medium tracking-[0.2em] text-evergreen-hi"
          data-rich-section={section}
        >
          {String(section).padStart(2, '0')}
        </span>
      )}
      <RichSpans spans={spans} />
      {!muted && (
        <motion.span
          aria-hidden="true"
          className="mt-2 block h-[3px] w-10 origin-left rounded-full bg-evergreen"
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: landed || reduced ? 1 : 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: reduced ? 0 : delay + 0.2 }}
        />
      )}
    </h3>
  );
}
