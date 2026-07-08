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
  getNextLesson,
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
    // A not-found / RLS-blocked lesson (e.g. a live class started on another
    // tenant's content) throws — don't burn ~7s of retries leaving the learner
    // on a blank skeleton; settle fast so the "unavailable" state can show.
    retry: false,
  });
}

/**
 * The lesson that comes after `lessonId` in the same program (canonical order),
 * or `null` when it's the last one. Powers the end-of-lesson "Próxima lição" CTA
 * (round-3 finding #4). Stale-cached generously — program structure is static.
 */
export function useNextLesson(lessonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lesson.next(lessonId ?? ''),
    queryFn: () => getNextLesson(lessonId as string),
    enabled: Boolean(lessonId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUserStats() {
  return useQuery({ queryKey: queryKeys.user.stats, queryFn: getUserStats });
}

export function useBadges() {
  return useQuery({ queryKey: queryKeys.user.badges, queryFn: getBadges });
}
