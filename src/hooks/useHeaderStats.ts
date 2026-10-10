import { useAccessLevel } from '@/hooks/useAccessLevel';
import { useAchievements } from '@/hooks/useAchievements';
import { useUserStats } from '@/hooks/useContent';
import { levelOf } from '@/utils/headerHud';

export interface HeaderStats {
  streak: number | null;
  xp: number | null;
  level: number | null;
  achievements: number | null;
}

/** The learner's streak, XP, level and achievement count: one read shared by the welcome strip and the account menu. */
export function useHeaderStats(): HeaderStats {
  const visitor = useAccessLevel().level === 'visitor';
  const stats = useUserStats({ enabled: !visitor });
  const achievements = useAchievements({ enabled: !visitor });
  const xp = stats.data?.totalXp ?? null;
  return {
    streak: stats.data?.streakDays ?? null,
    xp,
    level: xp == null ? null : levelOf(xp).level,
    achievements: visitor ? 0 : achievements.isPending ? null : achievements.earnedCount,
  };
}
