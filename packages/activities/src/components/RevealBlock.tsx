/**
 * RevealBlock — one rich-text block that rises when it reaches the screen.
 *
 * Blocks above the fold cascade in a short stagger; a block the reader scrolls
 * to rises the moment it appears, with no queue behind it. The stagger is
 * capped so the last block of the opening is never more than a beat behind
 * the first.
 */
import { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { BlockReveal, useOnScreen } from './blockReveal.js';

const STAGGER_S = 0.07;
const STAGGER_CAP = 6;

export function RevealBlock({
  index,
  reduced,
  children,
}: {
  index: number;
  reduced: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { landed, early } = useOnScreen(ref, reduced);
  const delay = reduced || !early ? 0 : Math.min(index, STAGGER_CAP) * STAGGER_S;
  const state = useMemo(() => ({ landed, delay }), [landed, delay]);

  return (
    <motion.div
      ref={ref}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={landed ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay }}
      data-rich-reveal={landed ? 'landed' : 'pending'}
    >
      <BlockReveal.Provider value={state}>{children}</BlockReveal.Provider>
    </motion.div>
  );
}
