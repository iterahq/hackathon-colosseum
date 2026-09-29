import { AnimatePresence, motion } from 'framer-motion';

/**
 * The transient hint a wrong try shows — `wire.wrong_hint`, `spot.miss_hint`,
 * `intercept.wrong_hint`, `press.wrong_hint` in the scene-mechanics batch. The
 * learner cannot fail: this never blocks a next try, it only explains the one
 * that just happened. Shared across the batch instead of one inline `<span>`
 * per kind so the look (and the `data-testid`) never drifts kind to kind.
 */
export function WrongHint({ text }: { text: string | null }) {
  return (
    <div className="min-h-[28px]" data-testid="scene-wrong-hint">
      <AnimatePresence mode="wait">
        {text && (
          <motion.p
            key={text}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-[#C2410C]"
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
