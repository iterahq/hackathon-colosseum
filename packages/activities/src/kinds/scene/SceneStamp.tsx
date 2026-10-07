import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useActivityI18n } from '../../context.js';

const TILT = -4;

/** The concept's name appears as a small tilted label over the stage's top
 * edge — only after the gesture. It is absolutely positioned by `SceneFrame`,
 * so it takes no layout space and never scrolls the page. The quiet prefix
 * tells the learner what the label is. */
export function SceneStamp({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const { t } = useActivityI18n();
  return (
    <motion.div
      data-testid="scene-stamp"
      initial={reduced ? { opacity: 0, rotate: TILT } : { opacity: 0, y: 6, scale: 0.96, rotate: TILT }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: TILT }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="inline-flex max-w-full items-start gap-1.5 rounded-lg border border-evergreen/50 bg-card px-2 py-1 text-evergreen-hi shadow-sm"
      style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: 'clamp(11px,1.4vw,13px)',
        lineHeight: 1.15,
        textTransform: 'uppercase',
        letterSpacing: '.02em',
      }}
    >
      <Sparkles className="mt-px h-3 w-3 shrink-0" aria-hidden />
      <span>
        <span className="font-medium opacity-60">{t('activity.scene.stampLabel')} · </span>
        {text}
      </span>
    </motion.div>
  );
}
