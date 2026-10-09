import type { I18nText } from '@/types/content';

export type AchievementKind = 'day' | 'trail' | 'streak' | 'milestone';
export type MintStatus = 'unclaimed' | 'pending' | 'minted' | 'failed';

/** A row of the achievement catalog (`itera.achievements`). */
export interface Achievement {
  key: string;
  kind: AchievementKind;
  tier: string | null;
  title: I18nText;
  description: I18nText;
  art: Record<string, unknown>;
  sort: number;
}

/** A row of `itera.user_achievements`: one achievement the learner earned. */
export interface UserAchievement {
  achievementKey: string;
  refId: string | null;
  earnedAt: string | null;
  mintStatus: MintStatus;
  assetAddress: string | null;
  txSignature: string | null;
}

/** A catalog entry joined with what the learner earned of it. */
export interface AchievementView extends Achievement {
  earned: UserAchievement | null;
}
