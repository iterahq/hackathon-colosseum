/**
 * Everything the universal home screen takes from the web: the reads of the dashboard, who is a visitor,
 * the search of the header, where a tap leads, and the one place that words a visitor's hint and offer.
 * The screen draws; this decides. componente → hook → service.
 *
 * Visitor mode (2026-09-18): a signed-in user with no active subscription browses this page instead of
 * being redirected (RequireSubscription mode="preview"). Their dashboard has zero enrolled programs by
 * construction (RLS), so the locked catalog replaces it, and the reads that would come back empty or in
 * error for them (enrolled programs, stats, badges) are not made at all. Inside the shell the hint and the
 * offer are left out (`useShellSurface`).
 */
import { useNavigate, useSearchParams } from 'react-router-dom';
import { homeViewOf } from '@iterahq/shell-core';
import type { HomeScreenProps } from '@iterahq/screens/home';
import { useAuth } from '@/auth/AuthContext';
import { useBadges, usePrograms, useUserStats } from '@/hooks';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { useCatalog } from '@/hooks/useCatalog';
import { useShellSurface } from '@/hooks/useShellSurface';
import { useI18n } from '@/i18n';

const SUBSCRIBE = '/subscribe';

export function useHomeScreen(): Pick<HomeScreenProps, 't' | 'view' | 'onOpenProgram' | 'onBrowseCatalog' | 'onRetry'> {
  const navigate = useNavigate();
  const { t, tText } = useI18n();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const visitor = useAccessLevel().level === 'visitor';
  const web = useShellSurface() === 'web';
  const programs = usePrograms({ enabled: !visitor });
  const stats = useUserStats({ enabled: !visitor });
  const badges = useBadges({ enabled: !visitor });
  const catalog = useCatalog({ enabled: visitor });

  const view = homeViewOf({
    visitor,
    email: user?.email,
    // The search of the header filters the program grid (`?q=`), for a member only.
    search: (searchParams.get('q') ?? '').trim().toLowerCase(),
    programs,
    stats,
    badges,
    catalog,
    offer: web ? { label: t('catalog.locked.cta'), link: { href: SUBSCRIBE, go: () => navigate(SUBSCRIBE) } } : undefined,
    hint: web ? t('subscription.inactiveHint') : undefined,
    t,
    tText,
  });

  return {
    t,
    view,
    onOpenProgram: (slug) => navigate(`/program/${slug}`),
    onBrowseCatalog: () => navigate('/catalog'),
    onRetry: () => void (visitor ? catalog.refetch() : programs.refetch()),
  };
}
