import { motion, useReducedMotion } from 'framer-motion';
import { TeraAvatar, type TeraMood, type TeraSize } from '@iterahq/activities';
import { OUTFITS, OUTFIT_BLEED, OUTFIT_BOX, OUTFIT_LAYER, frontSources, selectOutfit } from './outfits';

interface Props {
  mood: TeraMood;
  size?: TeraSize;
  idle?: boolean;
  /** The learner's equipped outfit (a shop item key). */
  outfit: string | null | undefined;
  /** Try-on in the shop: wins over `outfit`; `null` shows Tera bare. */
  preview?: string | null;
  className?: string;
  /**
   * The learner's own expression art (the full 512 px image of a free icon). When set it is drawn in
   * place of the built-in `TeraAvatar`, scaled so its ring is the avatar box: the layers keep fitting.
   */
  face?: string;
}

/**
 * A layer covers the face box plus its bleed: wider than the avatar by the bleed on each side and
 * hanging below it by the same amount. Percentages resolve against the square avatar box, so one
 * rule fits every `TeraSize` and nothing shifts the layout (the layers are absolutely positioned).
 */
const BLEED = `${(-OUTFIT_BLEED / OUTFIT_BOX.width) * 100}%`;
const LAYER_STYLE = { left: BLEED, bottom: BLEED, width: `${(OUTFIT_LAYER.width / OUTFIT_BOX.width) * 100}%` } as const;
/** The centre of the square avatar box, measured inside a layer: the two must turn around the same point. */
const ORIGIN_Y = ((OUTFIT_LAYER.height - OUTFIT_BLEED - OUTFIT_BOX.width / 2) / OUTFIT_LAYER.height) * 100;
const ORIGIN = `50% ${ORIGIN_Y.toFixed(2)}%`;
/** In the 512 px expression art the ring is a circle of 380 px centred at (256, 293): fit it to the box of the built-in face. */
const ART = { side: 512, ring: 380, left: 66, ringBottom: 483 } as const;
const ART_STYLE = {
  width: `${(ART.side / ART.ring) * 100}%`,
  left: `${(-ART.left / ART.ring) * 100}%`,
  bottom: `${(-(ART.side - ART.ringBottom) / ART.ring) * 100}%`,
} as const;
const FACE_SIZES = { xs: 'h-8 w-8', sm: 'h-10 w-10', bar: 'h-14 w-14', bubble: 'h-[72px] w-[72px]', xl: 'h-24 w-24' } as const;
const LAYER = 'pointer-events-none absolute block h-auto max-w-none select-none';

/**
 * The LEARNER'S Tera: the untouched `TeraAvatar` between the two painted layers of the equipped
 * accessory, `back` under his face and `front` over it. The layers repeat the avatar's own bob and
 * cheer so the three move as one. Tera as the guide inside activities stays plain `TeraAvatar`.
 */
export function TeraOutfit({ mood, size = 'bubble', idle = true, outfit, preview, className = '', face }: Props) {
  const reduced = useReducedMotion();
  const key = selectOutfit(outfit, preview);
  const art = key ? OUTFITS[key] : null;
  const animate = reduced ? undefined : mood === 'happy' ? { rotate: [0, -8, 8, 0], y: [0, -6, 0] } : idle ? { y: [0, -2, 0] } : undefined;
  const transition = mood === 'happy' ? { duration: 0.6 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const };
  const layer = (src: string, part: 'back' | 'front', shown: boolean) => (
    <motion.img
      key={`${src}:${mood}`}
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={OUTFIT_LAYER.width}
      height={OUTFIT_LAYER.height}
      data-outfit-layer={part}
      className={`${LAYER} ${shown ? 'opacity-100' : 'opacity-0'}`}
      style={{ ...LAYER_STYLE, transformOrigin: ORIGIN }}
      animate={animate}
      transition={transition}
    />
  );

  return (
    <span className={`relative inline-block shrink-0 ${className}`} data-testid="tera-outfit" data-outfit={key ?? 'none'}>
      {art?.back && layer(art.back, 'back', true)}
      {face ? (
        <motion.span aria-hidden="true" data-tera-face="art" className={`relative block shrink-0 drop-shadow-[0_8px_16px_rgba(63,209,127,.35)] ${FACE_SIZES[size]}`} animate={animate} transition={transition}>
          <img src={face} alt="" draggable={false} className="absolute max-w-none select-none" style={ART_STYLE} />
        </motion.span>
      ) : (
        <TeraAvatar mood={mood} size={size} idle={idle} />
      )}
      {key && art && frontSources(key).map((src) => layer(src, 'front', src === art.front[mood]))}
    </span>
  );
}
