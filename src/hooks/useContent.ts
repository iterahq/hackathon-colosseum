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
  getTenantLessons,
  getUserStats,
  isProgramNotFoundError,
} from '@/services/programs.service';
import { getGuestLessonContent } from '@/services/guestSession.service';

export function usePrograms({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: queryKeys.programs.all, queryFn: getPrograms, enabled });
}

export function useTenantLessons(tenantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.programs.tenantLessons(tenantId ?? ''),
    queryFn: () => getTenantLessons(tenantId as string),
    enabled: Boolean(tenantId),
  });
}

export function useProgram(slug: string | undefined) {
  // Locale participates in the key so a language change re-maps the authored
  // content instead of serving the other language from cache — see queryKeys.ts.
  const { locale } = useI18n();
  return useQuery({
    queryKey: queryKeys.programs.bySlug(slug ?? '', locale),
    queryFn: () => getProgramBySlug(slug as string),
    enabled: Boolean(slug),
    // A program the caller is not enrolled in is hidden by RLS, so the read
    // resolves to nothing — permanently. The default 3 retries then held the
    // learner ~7s on a skeleton that has ZERO text before any message appeared.
    // Same rule and same reason as `useActivity` in `useAuthorCanvas.ts`:
    // settle a not-found immediately, keep retrying a transport failure.
    retry: (failureCount, error) => !isProgramNotFoundError(error) && failureCount < 3,
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

export function useUserStats({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: queryKeys.user.stats, queryFn: getUserStats, enabled });
}

export function useBadges({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: queryKeys.user.badges, queryFn: getBadges, enabled });
}
