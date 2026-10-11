/**
 * The achievement catalog joined with the learner's earned rows, locked ones included.
 * componente → hook → service → Supabase.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { getAchievementCatalog, getMyAchievements } from '@/services/achievements.service';
import type { AchievementView, UserAchievement } from '@/types/achievements';

const NO_ROWS: readonly UserAchievement[] = [];

export function useAchievements({ enabled = true }: { enabled?: boolean } = {}) {
  const { session, configured } = useAuth();
  const userId = session?.user?.id ?? 'anon';
  const on = enabled && configured && Boolean(session);
  const catalog = useQuery({ queryKey: queryKeys.achievements.catalog, queryFn: getAchievementCatalog, enabled: on });
  const mine = useQuery({ queryKey: queryKeys.achievements.mine(userId), queryFn: getMyAchievements, enabled: on });

  const earnedByKey = new Map((mine.data ?? []).map((a) => [a.achievementKey, a]));
  const items: AchievementView[] = (catalog.data ?? []).map((a) => ({ ...a, earned: earnedByKey.get(a.key) ?? null }));

  return {
    items,
    /** Every earned row, one per day stamp: the catalog join above keeps one row per key. */
    earned: mine.data ?? NO_ROWS,
    earnedCount: items.filter((a) => a.earned).length,
    isPending: catalog.isPending || mine.isPending,
    isError: catalog.isError || mine.isError,
    refetch: () => void Promise.all([catalog.refetch(), mine.refetch()]),
  };
}
