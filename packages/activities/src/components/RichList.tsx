/**
 * RichList — list items as tactile rows. A bullet is an evergreen diamond; a
 * numbered item is a step: a keycap with the number and a thread down to the
 * next one, so a procedure reads as a path. Rows slide in one after the other
 * once the block lands, and tint on hover without that meaning anything.
 *
 * `muted` keeps the plain browser list: the secondary description stays
 * secondary.
 */
import { useContext } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RichSpans } from './RichSpans.js';
import { BlockReveal } from './blockReveal.js';
import type { Inline } from '../internal/richText.js';

const ROW_STAGGER_S = 0.05;
const ROW_STAGGER_CAP = 6;

export function RichList({
  ordered,
  start,
  items,
  muted,
  textClass,
  terms = false,
}: {
  ordered: boolean;
  start: number;
  items: Inline[][];
  muted: boolean;
  textClass: string;
  terms?: boolean;
}) {
  const { landed, delay } = useContext(BlockReveal);
  const reduced = useReducedMotion();

  if (muted) {
    const Tag = ordered ? 'ol' : 'ul';
    return (
      <Tag
        className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-1.5 pl-5 marker:text-evergreen ${textClass}`}
        data-rich-block="list"
        start={ordered ? start : undefined}
      >
        {items.map((item, i) => (
          <li key={i}>
            <RichSpans spans={item} />
          </li>
        ))}
      </Tag>
    );
  }

  const Tag = ordered ? 'ol' : 'ul';
  const shown = landed || reduced;
  return (
    <Tag
      role="list"
      className={`list-none space-y-0.5 ${textClass}`}
      data-rich-block="list"
      data-ordered={ordered ? 'true' : undefined}
      start={ordered ? start : undefined}
    >
      {items.map((item, i) => (
        <motion.li
          key={i}
          className="-mx-2 flex gap-3 rounded-lg px-2 py-1 transition-colors duration-200 hover:bg-foreground/[0.035]"
          initial={reduced ? false : { opacity: 0, x: -8 }}
          animate={shown ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
          transition={{
            duration: 0.35,
            ease: 'easeOut',
            delay: reduced ? 0 : delay + Math.min(i, ROW_STAGGER_CAP) * ROW_STAGGER_S,
          }}
        >
          {ordered ? (
            <span aria-hidden="true" className="relative shrink-0 self-stretch">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-evergreen/30 border-b-2 bg-evergreen-soft font-display text-base font-bold leading-none text-evergreen-hi"
                data-step={start + i}
              >
                {start + i}
              </span>
              {i < items.length - 1 && (
                <span className="absolute left-1/2 top-8 -bottom-2 w-px -translate-x-1/2 bg-evergreen/25" />
              )}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="mt-[0.7em] h-2 w-2 shrink-0 rotate-45 rounded-[2px] bg-evergreen"
            />
          )}
          <span className="min-w-0 flex-1">
            <RichSpans spans={item} terms={terms} />
          </span>
        </motion.li>
      ))}
    </Tag>
  );
}
