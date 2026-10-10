import { AvatarLook } from '@/components/avatar/AvatarLook';
import type { LearnerAvatar as Avatar } from '@/types/avatar';

export { moodOfAvatar } from '@/components/avatar/AvatarLook';

interface Props {
  avatar: Avatar;
  /** The equipped outfit's item key (or the one being tried on). */
  outfit: string | null;
  className?: string;
}

/** The learner's look as it is right now: THE learner's own avatar is the big picture, with the outfit on it when allowed. */
export function LookStage({ avatar, outfit, className = '' }: Props) {
  return (
    <span className={`relative flex h-[220px] w-[220px] flex-none items-center justify-center overflow-hidden rounded-[18px] border border-[#262320] bg-[#0F0D0B] ${className}`} data-testid="look-stage" data-avatar={avatar.key} data-outfit-shown={avatar.allowsOutfit}>
      <AvatarLook avatar={avatar} outfit={outfit} size="92%" />
    </span>
  );
}
