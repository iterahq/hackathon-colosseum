import { motion, useReducedMotion } from 'framer-motion';
import { SCENE_CODE_COLORS } from './sceneTheme.js';

/** What the ghost has typed so far, followed by a blinking caret. */
export function GhostCursor({ typed }: { typed: string }) {
  const reduced = useReducedMotion();
  return (
    <>
      <span style={{ color: SCENE_CODE_COLORS.text }} data-testid="live-type-ghost">
        {typed}
      </span>
      <motion.span
        animate={reduced ? undefined : { opacity: [1, 0, 1] }}
        transition={{ duration: 0.9, repeat: Infinity }}
        className="inline-block w-[2px] h-[1.1em] align-middle bg-evergreen mx-px"
      />
    </>
  );
}
