import { motion, useReducedMotion } from 'framer-motion';
import { useActivityI18n } from '../../context.js';

/** Touch screens have no hover: the hint says "finger" there and "mouse" elsewhere. */
function isTouchOnly() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;
}

/** A ghost ring drifting across the stage: "sweep me", before the first touch. */
export function XrayHint() {
  const reduced = useReducedMotion();
  const { t } = useActivityI18n();
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" data-testid="xray-hint">
      <motion.div
        animate={reduced ? undefined : { x: [-60, 60, -60], y: [0, -18, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        className="h-20 w-20 rounded-full border-2 border-evergreen shadow-[0_0_30px_rgba(63,209,127,.5)]"
      />
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-obsidiana/85 px-4 py-1.5 font-body text-sm font-semibold text-menta shadow-lg">
        {t(isTouchOnly() ? 'activity.xray.hint.touch' : 'activity.xray.hint.mouse')}
      </span>
    </div>
  );
}
