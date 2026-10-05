/**
 * TeraAvatar — THE one way Tera, the Itera phoenix, is drawn anywhere: the
 * guide bubble, the miss bar, the verdict footer, the card corner. Faces are
 * Samuel's own 2D crops (`guideFaces.ts`), used exactly as they are.
 *
 * When Tera becomes an animation, this file changes and nothing else does:
 * every surface passes a `mood` and a `size` and gets whatever Tera is today.
 *
 * The box is square and the face hangs from its bottom edge at 5:4, so the
 * head rises above the box — that is how he peeks over a border.
 */
import { motion, useReducedMotion } from 'framer-motion';
import {
  GUIDE_FACE_BLINK,
  GUIDE_FACE_HAPPY,
  GUIDE_FACE_NEUTRAL,
  GUIDE_FACE_OOPS,
} from '../kinds/scene/guideFaces.js';
import { useGuideBlink } from '../kinds/scene/useGuideBlink.js';

export type TeraMood = 'neutral' | 'happy' | 'oops';
export type TeraSize = 'xs' | 'sm' | 'bar' | 'bubble' | 'xl';

const FACES = [
  ['neutral', GUIDE_FACE_NEUTRAL],
  ['blink', GUIDE_FACE_BLINK],
  ['happy', GUIDE_FACE_HAPPY],
  ['oops', GUIDE_FACE_OOPS],
] as const;

const SIZES: Record<TeraSize, string> = {
  xs: 'h-8 w-8',
  sm: 'h-10 w-10',
  bar: 'h-14 w-14',
  bubble: 'h-[72px] w-[72px]',
  xl: 'h-24 w-24',
};

export function TeraAvatar({
  mood,
  size = 'bubble',
  idle = true,
  className = '',
}: {
  mood: TeraMood;
  size?: TeraSize;
  /** Blink and bob while neutral. Off where he is a still mark next to text. */
  idle?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const blinking = useGuideBlink(mood === 'neutral' && idle && !reduced);
  const face = mood === 'neutral' && blinking ? 'blink' : mood;
  const animate = reduced
    ? undefined
    : mood === 'happy'
      ? { rotate: [0, -8, 8, 0], y: [0, -6, 0] }
      : idle
        ? { y: [0, -2, 0] }
        : undefined;

  return (
    <motion.span
      aria-hidden="true"
      data-tera={mood}
      data-face={face}
      className={`relative block shrink-0 drop-shadow-[0_8px_16px_rgba(63,209,127,.35)] ${SIZES[size]} ${className}`}
      animate={animate}
      transition={mood === 'happy' ? { duration: 0.6 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
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
