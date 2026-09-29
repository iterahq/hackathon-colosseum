import { motion, useReducedMotion } from 'framer-motion';

/** The built-in guide face — bobs while talking, beams when the learner nails it. */
export function GuideAvatar({ happy }: { happy: boolean }) {
  const reduced = useReducedMotion();
  const animate = reduced ? undefined : happy ? { rotate: [0, -8, 8, 0], y: [0, -6, 0] } : { y: [0, -2, 0] };
  return (
    <motion.svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="h-14 w-14 shrink-0 drop-shadow-[0_8px_16px_rgba(219,39,119,.35)]"
      animate={animate}
      transition={happy ? { duration: 0.6 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <circle cx="32" cy="32" r="30" fill="#FFE4EC" />
      <path d="M8 34 C6 12 24 4 34 6 C50 8 60 20 56 38 C52 26 44 20 30 22 C20 23 12 28 8 34Z" fill="#3B1F2B" />
      <circle cx="24" cy="36" r="3" fill="#3B1F2B" />
      <circle cx="42" cy="36" r="3" fill="#3B1F2B" />
      <circle cx="18" cy="43" r="3.5" fill="#F9A8D4" opacity=".7" />
      <circle cx="48" cy="43" r="3.5" fill="#F9A8D4" opacity=".7" />
      {happy ? (
        <path d="M24 44 Q33 54 42 44 Z" fill="#DB2777" />
      ) : (
        <path d="M26 46 Q33 50 40 46" stroke="#3B1F2B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      )}
    </motion.svg>
  );
}
