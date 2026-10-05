/**
 * TermChip — a bold run that names what something IS ("`head` é o
 * **bastidor**"), raised off the line like a plate: a lighter fill, a lit top
 * edge and a dark ledge below. It sits between its two neighbours on
 * purpose: the keycap is dark mono (something you type), the mark is a green
 * sweep (the phrase to take away), the chip is body ink on a raised plate
 * (the word to learn).
 *
 * Which bold runs qualify is `internal/termChip.ts`, not this file.
 */
import { useContext } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { BlockReveal } from './blockReveal.js';

const PLATE =
  'rounded-md border border-foreground/15 border-t-foreground/30 bg-foreground/[0.07] px-1.5 font-semibold text-foreground transition-[transform,box-shadow] duration-150 hover:-translate-y-px';

const RAISED = '0 3px 0 rgba(0,0,0,.55)';
const SETTLED = '0 2px 0 rgba(0,0,0,.55)';

export function TermChip({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const { landed, delay } = useContext(BlockReveal);
  const settled = landed || reduced;

  return (
    <motion.strong
      className={PLATE}
      style={{ boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}
      initial={reduced ? false : { y: -2, boxShadow: RAISED }}
      animate={settled ? { y: 0, boxShadow: SETTLED } : { y: -2, boxShadow: RAISED }}
      transition={{ type: 'spring', stiffness: 520, damping: 26, delay: reduced ? 0 : delay + 0.25 }}
      data-term-chip="true"
    >
      {children}
    </motion.strong>
  );
}
