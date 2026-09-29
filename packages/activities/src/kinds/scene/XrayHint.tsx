import { motion, useReducedMotion } from 'framer-motion';

/** A ghost ring drifting across the stage: "sweep me", before the first touch. */
export function XrayHint() {
  const reduced = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" data-testid="xray-hint">
      <motion.div
        animate={reduced ? undefined : { x: [-60, 60, -60], y: [0, -18, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        className="h-20 w-20 rounded-full border-2 border-evergreen shadow-[0_0_30px_rgba(63,209,127,.5)]"
      />
    </div>
  );
}
