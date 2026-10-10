import { useState } from 'react';
import { AvatarBorderOverlay } from '@/components/avatar/AvatarBorderOverlay';
import { FALLBACK_AVATAR_IMAGE, type LearnerAvatar as Avatar } from '@/types/avatar';

const SIZES = { xs: 'h-7 w-7', sm: 'h-9 w-9', md: 'h-12 w-12', lg: 'h-20 w-20', xl: 'h-32 w-32' } as const;
export type LearnerAvatarSize = keyof typeof SIZES;

/**
 * THE one way a learner's profile picture is drawn: header, menu, welcome strip, profile, shop, ceremony.
 * Always the `chip` art: the full image has the crest outside the ring and must not be masked to a circle.
 * The ring is part of the art: nothing is drawn around it except the learner's data-driven profile
 * border (`avatar.border`), laid exactly over that ring and never changing the box.
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
  const src = failed === wanted ? FALLBACK_AVATAR_IMAGE : wanted;
  const base = 'shrink-0 rounded-full bg-[#141210] object-cover';
  if (!avatar.border) {
    return <img src={src} onError={() => setFailed(wanted)} alt="" draggable={false} data-avatar={avatar.key} data-rarity={avatar.rarity} className={`${base} ${SIZES[size]} ${className}`} />;
  }
  return (
    <span className={`relative inline-block shrink-0 rounded-full ${SIZES[size]} ${className}`} data-has-border>
      <img src={src} onError={() => setFailed(wanted)} alt="" draggable={false} data-avatar={avatar.key} data-rarity={avatar.rarity} className={`${base} block h-full w-full`} />
      <AvatarBorderOverlay border={avatar.border} />
    </span>
  );
}
