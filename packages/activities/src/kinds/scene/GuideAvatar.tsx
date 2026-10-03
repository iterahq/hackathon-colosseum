import { motion, useReducedMotion } from 'framer-motion';
import { GUIDE_FACE_BLINK, GUIDE_FACE_HAPPY, GUIDE_FACE_NEUTRAL } from './guideFaces.js';
import { useGuideBlink } from './useGuideBlink.js';

const FACES = [
  ['neutral', GUIDE_FACE_NEUTRAL],
  ['blink', GUIDE_FACE_BLINK],
  ['happy', GUIDE_FACE_HAPPY],
] as const;

/** The built-in guide face — Tera bobs and blinks while talking, beams when the learner nails it. */
export function GuideAvatar({ happy }: { happy: boolean }) {
  const reduced = useReducedMotion();
  const blinking = useGuideBlink(!happy && !reduced);
  const face = happy ? 'happy' : blinking ? 'blink' : 'neutral';
  const animate = reduced ? undefined : happy ? { rotate: [0, -8, 8, 0], y: [0, -6, 0] } : { y: [0, -2, 0] };
  return (
    <motion.span
      aria-hidden="true"
      data-face={face}
      className="relative block h-14 w-14 shrink-0 drop-shadow-[0_8px_16px_rgba(63,209,127,.35)]"
      animate={animate}
      transition={happy ? { duration: 0.6 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      {FACES.map(([key, src]) => (
        <img
          key={key}
          src={src}
          alt=""
          draggable={false}
          className={`absolute bottom-0 left-0 w-full max-w-none select-none ${key === face ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
    </motion.span>
  );
}
