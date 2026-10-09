import { motion, useReducedMotion } from 'framer-motion';
import { TeraAvatar, type TeraMood, type TeraSize } from '@iterahq/activities';
import { OUTFITS, OUTFIT_OUTLINE, OUTFIT_VIEW_BOX, selectOutfit } from './outfits';

interface Props {
  mood: TeraMood;
  size?: TeraSize;
  idle?: boolean;
  /** The learner's equipped outfit (a shop item key). */
  outfit: string | null | undefined;
  /** Try-on in the shop: wins over `outfit`; `null` shows Tera bare. */
  preview?: string | null;
  className?: string;
}

/** Dark halo in screen pixels: 2px, thinner on the smallest faces so the accessory does not swallow them. */
const OUTLINE: Record<TeraSize, number> = { xs: 0.5, sm: 0.75, bar: 1, bubble: 1, xl: 1 };
const halo = (px: number) => `drop-shadow(0 0 ${px}px ${OUTFIT_OUTLINE}) drop-shadow(0 0 ${px}px ${OUTFIT_OUTLINE})`;

/**
 * The LEARNER'S Tera: the untouched `TeraAvatar` with the equipped accessory drawn as an SVG layer
 * over the face box. The layer repeats the avatar's own bob and cheer so the two move as one.
 * Tera as the guide inside activities stays plain `TeraAvatar`.
 */
export function TeraOutfit({ mood, size = 'bubble', idle = true, outfit, preview, className = '' }: Props) {
  const reduced = useReducedMotion();
  const key = selectOutfit(outfit, preview);
  const animate = reduced ? undefined : mood === 'happy' ? { rotate: [0, -8, 8, 0], y: [0, -6, 0] } : idle ? { y: [0, -2, 0] } : undefined;

  return (
    <span className={`relative inline-block shrink-0 ${className}`} data-testid="tera-outfit" data-outfit={key ?? 'none'}>
      <TeraAvatar mood={mood} size={size} idle={idle} />
      {key && (
        <motion.svg
          key={`${key}:${mood}`}
          aria-hidden="true"
          viewBox={OUTFIT_VIEW_BOX}
          className="pointer-events-none absolute bottom-0 left-0 w-full overflow-visible"
          style={{ transformOrigin: '50% 67.4%', filter: halo(OUTLINE[size]) }}
          animate={animate}
          transition={mood === 'happy' ? { duration: 0.6 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          {OUTFITS[key].map((shape, i) => (
            <path
              key={i}
              d={shape.d}
              fill={shape.fill ?? 'none'}
              fillOpacity={shape.fillOpacity}
              stroke={shape.stroke ?? 'none'}
              strokeWidth={shape.strokeWidth}
              strokeOpacity={shape.strokeOpacity}
              strokeLinecap="round"
              strokeLinejoin="round"
              transform={shape.transform}
            />
          ))}
        </motion.svg>
      )}
    </span>
  );
}
