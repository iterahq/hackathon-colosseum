/**
 * teraPresence — Tera shows up on the card of any activity that talks about
 * him. The renderer that dispatches the activity (the package's own, and the
 * Itera Player's) wraps the kind in `TeraMentionProvider`; `ActivityShell`
 * reads the answer and draws him peeking over the card's top-right corner.
 * One Tera per card, however many mentions; none where the kind already
 * draws him (the scene guide).
 */
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { mentionsTera } from '../internal/teraMention.js';
import { SPRING_POP } from './tactile.js';
import { TeraAvatar } from './TeraAvatar.js';

const TeraMention = createContext(false);

export function TeraMentionProvider({ spec, children }: { spec: unknown; children: ReactNode }) {
  const mentioned = useMemo(() => mentionsTera(spec), [spec]);
  return <TeraMention.Provider value={mentioned}>{children}</TeraMention.Provider>;
}

export function useTeraMentioned(): boolean {
  return useContext(TeraMention);
}

/** Tera peeking over the card's top-right corner, outside the text column. */
export function TeraPeek() {
  const reduced = useReducedMotion();
  return (
    <motion.span
      className="pointer-events-none absolute -top-3 right-4 block h-14 w-14 md:-top-6 md:right-6 md:h-20 md:w-20"
      data-testid="tera-presence"
      aria-hidden="true"
      initial={reduced ? false : { opacity: 0, y: 12, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING_POP, delay: reduced ? 0 : 0.25 }}
    >
      <TeraAvatar mood="neutral" size="bar" className="md:h-20 md:w-20" />
    </motion.span>
  );
}

/**
 * The card has no spare top padding, so the first lines of its text wrap around
 * Tera instead of running under him — on every screen, since he is 56 px on a
 * phone and 80 px from `md` up.
 */
export function TeraPeekRoom() {
  return (
    <span
      aria-hidden="true"
      data-testid="tera-presence-room"
      className="float-right block h-8 w-[60px] md:h-10 md:w-[76px]"
    />
  );
}
