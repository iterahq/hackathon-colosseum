import type { LoreTier } from '@/content/teraLore';
import { TERA_FALLBACK_IMAGE, teraAvatarImage } from '@/utils/teraAvatarImage';

const SIZES = { md: 'h-24 w-24', xl: 'h-40 w-40' } as const;

/** Round portrait (the ring is part of the art); falls back to the default Tera until the art is published. */
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
      data-tier={tier}
      onError={(e) => {
        if (!e.currentTarget.src.endsWith(TERA_FALLBACK_IMAGE)) e.currentTarget.src = TERA_FALLBACK_IMAGE;
      }}
      className={`shrink-0 rounded-full bg-[#0A0908] object-cover ${SIZES[size]} ${className}`}
    />
  );
}
