import { useState } from 'react';
import { DEFAULT_AVATAR, type AvatarRarity, type LearnerAvatar as Avatar } from '@/types/avatar';

const SIZES = { xs: 'h-7 w-7', sm: 'h-9 w-9', md: 'h-12 w-12', lg: 'h-20 w-20', xl: 'h-32 w-32' } as const;
export type LearnerAvatarSize = keyof typeof SIZES;

/** Green is the brand ring; rarer tiers get a thin metal edge, never a large colour fill. */
const RING: Record<AvatarRarity, string> = {
  common: 'ring-[#262320]',
  rare: 'ring-[#3FD17F]',
  epic: 'ring-[#62D996]',
  legendary: 'ring-[#F2C66D]',
  mythic: 'ring-[#F4EDE2]',
};

/** THE one way a learner's profile picture is drawn: header, menu, welcome strip, profile, shop, ceremony. */
export function LearnerAvatar({
  avatar,
  size = 'sm',
  thumb = true,
  className = '',
}: {
  avatar: Avatar;
  size?: LearnerAvatarSize;
  /** Small sizes use the 128 px thumbnail. */
  thumb?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const wanted = thumb && size !== 'lg' && size !== 'xl' ? avatar.thumbUrl : avatar.imageUrl;
  return (
    <img
      src={failed === wanted ? DEFAULT_AVATAR.imageUrl : wanted}
      onError={() => setFailed(wanted)}
      alt=""
      draggable={false}
      data-avatar={avatar.key}
      data-rarity={avatar.rarity}
      className={`shrink-0 rounded-full bg-[#141210] object-cover ring-2 ${RING[avatar.rarity]} ${SIZES[size]} ${className}`}
    />
  );
}
