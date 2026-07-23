import { motion } from 'framer-motion';
import { Hourglass } from 'lucide-react';

/**
 * Playful "waiting for the instructor" indicator shown once a learner has
 * answered in a live class — a swaying hourglass + bouncing dots so the forced
 * wait feels alive instead of a dead screen.
 */
export function LiveWaitingIndicator({ correct }: { correct: boolean }) {
  const tint = correct ? 'text-menta' : 'text-clay';
  return (
    <span className={`inline-flex items-center gap-2 ${tint}`} data-testid="live-waiting-indicator">
      <motion.span
        aria-hidden="true"
        animate={{ rotate: [0, 180, 180, 360] }}
        transition={{ duration: 2.4, times: [0, 0.4, 0.6, 1], repeat: Infinity, ease: 'easeInOut' }}
      >
        <Hourglass className="w-4 h-4" />
      </motion.span>
      <span className="inline-flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="inline-block w-1.5 h-1.5 rounded-full bg-current"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
          />
        ))}
      </span>
    </span>
  );
}
