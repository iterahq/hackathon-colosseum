import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import type { LearnerAvatar as Avatar } from '@/types/avatar';

interface Props {
  avatar: Avatar;
  /** The equipped outfit's item key. */
  outfit: string | null;
  className?: string;
}

/**
 * The learner's look as it is right now. A free icon takes the outfit: Tera wears it, with the
 * profile picture pinned to the corner. A painted avatar is a whole head: it stands alone and
 * nothing is drawn on top of it.
 */
export function LookStage({ avatar, outfit, className = '' }: Props) {
  return (
    <span className={`relative flex h-[220px] w-[220px] flex-none items-end justify-center overflow-hidden rounded-[18px] border border-[#262320] bg-[#0F0D0B] ${className}`} data-testid="look-stage" data-avatar={avatar.key} data-outfit-shown={avatar.allowsOutfit}>
      {avatar.allowsOutfit ? (
        <>
          <span className="mb-7 block origin-bottom scale-[1.3]">
            <TeraOutfit mood="neutral" size="xl" outfit={outfit} />
          </span>
          <LearnerAvatar avatar={avatar} size="md" className="absolute bottom-3 right-3 !ring-offset-2 ring-offset-[#0F0D0B]" />
        </>
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <LearnerAvatar avatar={avatar} size="xl" className="!h-40 !w-40" />
        </span>
      )}
    </span>
  );
}
