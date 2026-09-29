import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** The concept's name lands like a rubber stamp — only after the gesture —
 * and is scrolled into view, because a tall stage can leave it below the fold. */
export function SceneStamp({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [reduced]);
  return (
    <motion.div
      ref={ref}
      data-testid="scene-stamp"
      initial={reduced ? { opacity: 0 } : { scale: 2.4, rotate: -14, opacity: 0 }}
      animate={{ scale: 1, rotate: -3, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 16 }}
      className="inline-block rounded-lg border-[3px] border-evergreen px-5 py-2 text-evergreen shadow-[0_0_40px_rgba(63,209,127,.35)]"
      style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 800,
        fontSize: 'clamp(22px,3vw,34px)',
        textTransform: 'uppercase',
        letterSpacing: '.02em',
      }}
    >
      {text}
    </motion.div>
  );
}
