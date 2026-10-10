import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import type { TeraMood } from '@iterahq/activities';
import type { LearnerAvatar as Avatar } from '@/types/avatar';

interface Props {
  avatar: Avatar;
  /** The equipped outfit's item key. */
  outfit: string | null;
  className?: string;
}

/** The outfit layers have three face cuts: the expression the learner wears picks the closest one. */
const MOODS: Record<string, TeraMood> = { tera_feliz: 'happy', tera_sorriso: 'happy', tera_piscada: 'happy', tera_triste: 'oops', tera_sob_pressao: 'oops', tera_surpreso: 'oops' };
export const moodOfAvatar = (key: string): TeraMood => MOODS[key] ?? 'neutral';

/**
 * The learner's look as it is right now: THE learner's own avatar is the big picture, always.
 * A free expression takes the outfit layer, drawn on that same expression (never the site's default
 * Tera next to a chip); a painted avatar is a whole head and stands alone with its profile border.
 */
export function LookStage({ avatar, outfit, className = '' }: Props) {
  return (
    <span className={`relative flex h-[220px] w-[220px] flex-none items-end justify-center overflow-hidden rounded-[18px] border border-[#262320] bg-[#0F0D0B] ${className}`} data-testid="look-stage" data-avatar={avatar.key} data-outfit-shown={avatar.allowsOutfit}>
      {avatar.allowsOutfit ? (
        <span className="mb-7 block origin-bottom scale-[1.3]" data-testid="look-stage-art">
          <TeraOutfit mood={moodOfAvatar(avatar.key)} size="xl" outfit={outfit} face={avatar.imageUrl} />
        </span>
      ) : (
        <span className="flex h-full w-full items-center justify-center" data-testid="look-stage-art">
          <LearnerAvatar avatar={avatar} size="xl" className="!h-[72%] !w-[72%]" />
        </span>
      )}
    </span>
  );
}
