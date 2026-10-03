import { motion, useReducedMotion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { SPRING_POP } from './tactile.js';

/**
 * The round badge a verdict lands on: a green check for a right answer, a quiet
 * dashed X for a miss. The slot is always the same size, so the mark popping in
 * never moves the row it sits on.
 */
export function VerdictMark({
  verdict,
  delay = 0,
}: {
  verdict: 'right' | 'miss' | null;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <span className="w-6 h-6 flex-shrink-0 inline-flex items-center justify-center" aria-hidden={verdict === null}>
      {verdict && (
        <motion.span
          data-verdict-mark={verdict}
          initial={reduced ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...SPRING_POP, delay: reduced ? 0 : delay }}
          className={`w-6 h-6 rounded-full inline-flex items-center justify-center ${
            verdict === 'right'
              ? 'bg-evergreen text-obsidiana'
              : 'border border-dashed border-foreground/30 text-foreground/50'
          }`}
        >
          {verdict === 'right' ? (
            <Check className="w-3.5 h-3.5" strokeWidth={3} />
          ) : (
            <X className="w-3.5 h-3.5" strokeWidth={2.5} />
          )}
        </motion.span>
      )}
    </span>
  );
}
