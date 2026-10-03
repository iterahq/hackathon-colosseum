import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

/** The concept's name appears as a compact label — only after the gesture. It
 * never scrolls the page: its slot in `SceneFrame` is reserved up front. */
export function SceneStamp({ text }: { text: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      data-testid="scene-stamp"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="inline-flex items-center gap-2 rounded-xl border border-evergreen/50 bg-evergreen-soft/60 px-3.5 py-1.5 text-evergreen-hi"
      style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: 'clamp(16px,2vw,20px)',
        textTransform: 'uppercase',
        letterSpacing: '.02em',
      }}
    >
      <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
      {text}
    </motion.div>
  );
}
