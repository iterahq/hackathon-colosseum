/**
 * React Query hooks for the canonical Itera content (real Supabase data).
 *
 * componente → hook (useQuery) → service → fetch. Hooks return the raw React
 * Query object; pages handle isPending / isError / data.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import {
  getBadges,
  getLessonWithActivities,
  getProgramBySlug,
  getPrograms,
  getUserStats,
} from '@/services/programs.service';

export function usePrograms() {
  return useQuery({ queryKey: queryKeys.programs.all, queryFn: getPrograms });
}

export function useProgram(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.programs.bySlug(slug ?? ''),
    queryFn: () => getProgramBySlug(slug as string),
    enabled: Boolean(slug),
  });
}

export function useLessonContent(lessonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lesson.byId(lessonId ?? ''),
    queryFn: () => getLessonWithActivities(lessonId as string),
    enabled: Boolean(lessonId),
  });
}

export function useUserStats() {
  return useQuery({ queryKey: queryKeys.user.stats, queryFn: getUserStats });
}

export function useBadges() {
  return useQuery({ queryKey: queryKeys.user.badges, queryFn: getBadges });
}
