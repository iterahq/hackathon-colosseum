import type { LoreTier } from '@/content/teraLore';
import { TERA_FALLBACK_IMAGE, teraAvatarImage } from '@/utils/teraAvatarImage';

const SIZES = { md: 'h-24 w-24', xl: 'h-40 w-40' } as const;

/** Round portrait (the ring is part of the art), loaded at once: the cast page exists for these pictures. A soft glow stands in while a picture arrives; a missing file falls back to the default Tera. */
export function TeraPortrait({ avatarKey, tier, size = 'md', art = 'chip', className = '' }: {
  avatarKey: string;
  tier: LoreTier;
  size?: keyof typeof SIZES;
  art?: 'chip' | 'full';
  className?: string;
}) {
  return (
    <img
      src={teraAvatarImage(avatarKey, art)}
      alt=""
      loading="eager"
      decoding="async"
      draggable={false}
      data-tier={tier}
      onError={(e) => {
        if (!e.currentTarget.src.endsWith(TERA_FALLBACK_IMAGE)) e.currentTarget.src = TERA_FALLBACK_IMAGE;
      }}
      className={`shrink-0 rounded-full bg-[radial-gradient(circle_at_50%_40%,#1d3a2a_0%,#141210_70%)] object-cover ${SIZES[size]} ${className}`}
    />
  );
}
