import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import { useLearnerAvatar } from '@/hooks/useLearnerAvatar';
import { DEFAULT_AVATAR_KEY } from '@/types/avatar';

type Mood = 'neutral' | 'happy' | 'oops';

/**
 * The learner's Tera reacting (happy, oops): the built-in mascot with its mood and outfit for a learner who
 * wears the default Tera, the learner's own picture for one who wears another avatar. The built-in
 * Tera is never shown to somebody who chose a different face.
 */
export function LearnerMascot({ mood, outfit }: { mood: Mood; outfit: string | null | undefined }) {
  const avatar = useLearnerAvatar();
  if (avatar.key === DEFAULT_AVATAR_KEY) return <TeraOutfit mood={mood} size="xl" outfit={outfit} />;
  return <LearnerAvatar avatar={avatar} size="xl" />;
}
