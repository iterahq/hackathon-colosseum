import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { isGuestAccessToken } from '@/services/guestSession.service';
import { getIteraUserId } from '@/services/iteraUser';
import { getLessonWithActivities } from '@/services/programs.service';
import { loadLessonPlayer } from '@/pages/learnerPageLoaders';

const LESSON_PATH = /^\/lesson\/([0-9a-f-]{36})\/?$/i;

/** The lesson id in the current path, or null anywhere else. */
export function lessonIdOf(pathname: string): string | null {
  return LESSON_PATH.exec(pathname)?.[1] ?? null;
}

/**
 * On a cold open of /lesson/:id the lesson content used to wait behind the auth guards, the itera user id and the
 * membership reads (a serial chain of round trips). Mounted outside the guards, this starts the lesson read, the
 * user-id read and the player chunk the moment the session is known, so the guards find everything in cache.
 * It never renders and never blocks; a failed prefetch is simply fetched again by the player.
 */
export function LessonPrefetch() {
  const { pathname } = useLocation();
  const { session, configured } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const lessonId = lessonIdOf(pathname);
  const signedIn = configured && Boolean(session) && !isGuestAccessToken(session?.access_token);

  useEffect(() => {
    if (!lessonId || !signedIn) return;
    void loadLessonPlayer().catch(() => undefined);
    void getIteraUserId().catch(() => undefined);
    void queryClient
      .prefetchQuery({ queryKey: queryKeys.lesson.byId(lessonId, locale), queryFn: () => getLessonWithActivities(lessonId), retry: false, staleTime: 30_000 })
      .catch(() => undefined);
  }, [lessonId, signedIn, locale, queryClient]);

  return null;
}
