import { useCompanion } from '@/hooks/useCompanion';
import { DEFAULT_AVATAR, type LearnerAvatar } from '@/types/avatar';

/** The signed-in learner's avatar; the default one while loading, on error, or without a companion backend. */
export function useLearnerAvatar(): LearnerAvatar {
  return useCompanion().data?.avatar ?? DEFAULT_AVATAR;
}
