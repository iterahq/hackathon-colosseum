import { useState } from 'react';
import { FALLBACK_AVATAR_IMAGE, type LearnerAvatar as Avatar } from '@/types/avatar';

const SIZES = { xs: 'h-7 w-7', sm: 'h-9 w-9', md: 'h-12 w-12', lg: 'h-20 w-20', xl: 'h-32 w-32' } as const;
export type LearnerAvatarSize = keyof typeof SIZES;

/**
 * THE one way a learner's profile picture is drawn: header, menu, welcome strip, profile, shop, ceremony.
 * Always the `chip` art: the full image has the crest outside the ring and must not be masked to a circle.
 * The ring is part of the art, so no border or ring is drawn around it.
 */
export function LearnerAvatar({
  avatar,
  size = 'sm',
  className = '',
}: {
  avatar: Avatar;
  size?: LearnerAvatarSize;
  /** Kept for callers written before the chip art existed; it no longer changes anything. */
  thumb?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const wanted = avatar.chipUrl || avatar.thumbUrl || avatar.imageUrl;
  return (
    <img
      src={failed === wanted ? FALLBACK_AVATAR_IMAGE : wanted}
      onError={() => setFailed(wanted)}
      alt=""
      draggable={false}
      data-avatar={avatar.key}
      data-rarity={avatar.rarity}
      className={`shrink-0 rounded-full bg-[#141210] object-cover ${SIZES[size]} ${className}`}
    />
  );
}
