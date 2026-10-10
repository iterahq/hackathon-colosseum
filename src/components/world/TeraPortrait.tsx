import { RING } from '@/components/avatar/LearnerAvatar';
import type { LoreTier } from '@/content/teraLore';
import { TERA_FALLBACK_IMAGE, teraAvatarImage } from '@/utils/teraAvatarImage';

const SIZES = { md: 'h-24 w-24', xl: 'h-40 w-40' } as const;

/** Round portrait with the tier's thin ring; falls back to the default Tera until the art is published. */
export function TeraPortrait({ avatarKey, tier, size = 'md', className = '' }: {
  avatarKey: string;
  tier: LoreTier;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <img
      src={teraAvatarImage(avatarKey, 'chip')}
      alt=""
      loading="lazy"
      draggable={false}
      onError={(e) => {
        if (!e.currentTarget.src.endsWith(TERA_FALLBACK_IMAGE)) e.currentTarget.src = TERA_FALLBACK_IMAGE;
      }}
      className={`shrink-0 rounded-full bg-[#0A0908] object-cover ring-2 ${RING[tier === 'free' ? 'common' : tier]} ${SIZES[size]} ${className}`}
    />
  );
}
