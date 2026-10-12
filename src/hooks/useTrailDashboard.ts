/**
 * The learner dashboard's trails: the program tree and progress reads, folded by `utils/trailDashboard`.
 * componente → hook → service → Supabase.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { getTrailSource } from '@/services/trails.service';
import { buildTrails, comingSoonOf, pickFeatured, weeklyCount } from '@/utils/trailDashboard';

export function useTrailDashboard({ enabled = true }: { enabled?: boolean } = {}) {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.dashboard.trails(session?.user?.id ?? 'anon'),
    queryFn: getTrailSource,
    enabled,
  });

  const model = useMemo(() => {
    const trails = buildTrails(query.data?.programs ?? [], query.data?.progress ?? []);
    return { trails, soon: comingSoonOf(query.data?.programs ?? []), featured: pickFeatured(trails), weekly: weeklyCount(query.data?.progress ?? []) };
  }, [query.data]);

  return { ...model, isPending: query.isPending && enabled, isError: query.isError, refetch: query.refetch };
}
