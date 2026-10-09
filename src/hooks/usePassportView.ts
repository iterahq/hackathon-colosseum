/** Everything the passport surfaces draw: pages per trail, the medal shelf, totals and the wallet. */
import { useMemo } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { useAchievements } from '@/hooks/useAchievements';
import { useTrailDashboard } from '@/hooks/useTrailDashboard';
import { useI18n } from '@/i18n';
import { buildMedals, buildPages, totals } from '@/utils/passport';
import { walletOf } from '@/utils/wallet';

export function usePassportView() {
  const { tText } = useI18n();
  const { user } = useAuth();
  const visitor = useAccessLevel().level === 'visitor';
  const dashboard = useTrailDashboard({ enabled: !visitor });
  const achievements = useAchievements({ enabled: !visitor });
  const { trails, featured } = dashboard;
  const { items } = achievements;

  const model = useMemo(() => {
    const pages = buildPages(trails, items, tText);
    const medals = buildMedals(items, tText);
    return { pages, medals, totals: totals(pages, medals) };
  }, [trails, items, tText]);

  return {
    ...model,
    featuredId: featured?.id ?? null,
    walletAddress: walletOf(user),
    isPending: dashboard.isPending || (!visitor && achievements.isPending),
    isError: dashboard.isError || achievements.isError,
    refetch: () => {
      void dashboard.refetch();
      achievements.refetch();
    },
  };
}
