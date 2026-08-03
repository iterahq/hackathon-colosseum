/**
 * React Query hooks for the canonical Itera content (real Supabase data).
 *
 * componente → hook (useQuery) → service → fetch. Hooks return the raw React
 * Query object; pages handle isPending / isError / data.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useI18n } from '@/i18n';
import type { LessonPlacement } from '@/services/programs.service';
import {
  getBadges,
  getLessonWithActivities,
  getNextLesson,
  getProgramBySlug,
  getPrograms,
  getUserStats,
} from '@/services/programs.service';
import { getGuestLessonContent } from '@/services/guestSession.service';

export function usePrograms() {
  return useQuery({ queryKey: queryKeys.programs.all, queryFn: getPrograms });
}

export function useProgram(slug: string | undefined) {
  // Locale participates in the key so a language change re-maps the authored
  // content instead of serving the other language from cache — see queryKeys.ts.
  const { locale } = useI18n();
  return useQuery({
    queryKey: queryKeys.programs.bySlug(slug ?? '', locale),
    queryFn: () => getProgramBySlug(slug as string),
    enabled: Boolean(slug),
  });
}

/**
 * The lesson + its activities for the player.
 *
 * `guestCode` switches the SOURCE, not the shape: a link-invited guest holds a
 * real JWT with ZERO memberships, so `itera.lessons` reads `[]` for them by
 * construction (content policies are membership-scoped and were deliberately NOT
 * touched — plan 20260728-…, ADR-2/B5). itera-api serves the invited session's
 * lesson instead, scoped server-side to that session. Everything downstream —
 * activities, the stage, the ranking — is identical.
 */
export type LessonContent = {
  id: string;
  title: import('@/types/content').I18nText;
  activities: import('@/types/content').Activity[];
  /** Absent for a guest — see `GuestLessonContent`. */
  placement?: LessonPlacement;
};

export function useLessonContent(lessonId: string | undefined, guestCode?: string) {
  // Locale participates in the key so a language change re-maps the authored
  // content instead of serving the other language from cache — see queryKeys.ts.
  const { locale } = useI18n();
  return useQuery<LessonContent>({
    queryKey: guestCode
      ? queryKeys.lesson.byGuestCode(guestCode, locale)
      : queryKeys.lesson.byId(lessonId ?? '', locale),
    queryFn: () =>
      guestCode ? getGuestLessonContent(guestCode) : getLessonWithActivities(lessonId as string),
    enabled: guestCode ? true : Boolean(lessonId),
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
