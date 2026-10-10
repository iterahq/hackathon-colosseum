/**
 * Lives of the learner on screen. Additive and fail-open: while the companion backend is missing,
 * failing, or the session is a guest or a harness, `active` is false and nothing here does anything.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useCompanion } from '@/hooks/useCompanion';
import { reportLessonEnd, reportLifeLost } from '@/services/companion.service';
import { isGuestAccessToken } from '@/services/guestSession.service';
import type { CompanionSnapshot, LivesState, LivesUpdate } from '@/types/shop';
import { livesActive, loseLife, regenerate, secondsToNextLife } from '@/utils/lives';

const mistakesKey = (lessonId: string) => `itera.lives.mistakes.${lessonId}`;

function readMistakes(lessonId: string): number {
  try {
    return Number(sessionStorage.getItem(mistakesKey(lessonId))) || 0;
  } catch {
    return 0;
  }
}

function writeMistakes(lessonId: string, n: number | null): void {
  try {
    if (n === null) sessionStorage.removeItem(mistakesKey(lessonId));
    else sessionStorage.setItem(mistakesKey(lessonId), String(n));
  } catch {
    /* private mode: the count lives for this page only */
  }
}

export function useLives({ harness = false, enabled = true }: { harness?: boolean; enabled?: boolean } = {}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const companion = useCompanion({ enabled: enabled && !harness });
  const { key, refetch } = companion;
  const [broken, setBroken] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const charged = useRef(new Set<string>());

  const active = livesActive({
    signedIn: Boolean(session),
    guest: isGuestAccessToken(session?.access_token),
    harness,
    backendReady: companion.isSuccess,
    broken,
  });
  const stored = active ? (companion.data?.lives ?? null) : null;
  const lives: LivesState | null = useMemo(() => (stored ? regenerate(stored, now) : null), [stored, now]);
  const seconds = lives ? secondsToNextLife(lives, now) : 0;

  const ticking = Boolean(stored?.nextRegenAt);
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  // A regeneration tick passed on the clock: ask the server for the real count.
  const regenerated = Boolean(stored && lives && lives.current > stored.current);
  useEffect(() => {
    if (regenerated) void refetch();
  }, [regenerated, refetch]);

  const apply = useCallback(
    (update: LivesUpdate) =>
      queryClient.setQueryData<CompanionSnapshot>(key, (prev) => (prev ? { ...prev, lives: update.lives, companion: update.companion ?? prev.companion, chain: update.chain ?? prev.chain } : prev)),
    [queryClient, key]
  );

  /** A wrong answer: one life, once per attempt. Shown at once, then replaced by the server's count. */
  const lose = useCallback(
    (attemptId: string, activityId: string, lessonId?: string) => {
      if (!active || charged.current.has(attemptId)) return;
      charged.current.add(attemptId);
      if (lessonId) writeMistakes(lessonId, readMistakes(lessonId) + 1);
      queryClient.setQueryData<CompanionSnapshot>(key, (prev) => (prev ? { ...prev, lives: loseLife(regenerate(prev.lives, Date.now()), Date.now()) } : prev));
      void reportLifeLost(attemptId, activityId)
        .then(apply)
        .catch(() => {
          // The backend went away mid-lesson: stand down and give the hearts back.
          setBroken(true);
          void queryClient.invalidateQueries({ queryKey: key });
        });
    },
    [active, apply, queryClient, key]
  );

  /** Lesson finished: resolves with the lives the server granted for a zero-mistake day (0 when none). */
  const endLesson = useCallback(
    async (lessonId: string): Promise<number> => {
      if (!active) return 0;
      const mistakes = readMistakes(lessonId);
      writeMistakes(lessonId, null);
      try {
        const update = await reportLessonEnd(lessonId, mistakes);
        apply(update);
        return update.bonus;
      } catch {
        return 0;
      }
    },
    [active, apply]
  );

  return { active, lives, secondsToNext: seconds, lose, endLesson, wallet: companion.wallet, outfit: companion.outfit, refetch, chain: companion.data?.chain ?? null, assetUrl: companion.data?.companion.explorerUrl ?? null };
}
