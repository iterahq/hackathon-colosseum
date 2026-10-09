/**
 * The Courses list: the learner's trails folded with the self-serve catalog, by `utils/courses`.
 * componente → hook → service → Supabase (reuses the dashboard and catalog reads).
 */
import { useMemo } from 'react';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { useCatalog } from '@/hooks/useCatalog';
import { useTrailDashboard } from '@/hooks/useTrailDashboard';
import { buildCourses } from '@/utils/courses';

export function useCourses() {
  const visitor = useAccessLevel().level === 'visitor';
  const dashboard = useTrailDashboard({ enabled: !visitor });
  const catalog = useCatalog();

  const courses = useMemo(() => buildCourses(visitor ? [] : dashboard.trails, catalog.data ?? []), [visitor, dashboard.trails, catalog.data]);

  return {
    courses,
    visitor,
    isPending: catalog.isPending || dashboard.isPending,
    isError: catalog.isError || dashboard.isError,
    refetch: () => {
      void catalog.refetch();
      void dashboard.refetch();
    },
  };
}
