/**
 * Runs the `passport` function once a lesson is finished and turns the answer into a ceremony.
 * Best effort: a missing, unauthorised or broken function leaves the lesson screen exactly as it was.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useTrailDashboard } from '@/hooks/useTrailDashboard';
import { useI18n } from '@/i18n';
import { PassportCallError, callPassport } from '@/services/passport.service';
import type { PassportResult } from '@/types/achievements';
import { ceremonyFromResult, mergeResults, shouldContinue, type CeremonyModel } from '@/utils/ceremony';
import { trailName } from '@/utils/trailDashboard';

const MAX_CALLS = 3;
/** Statuses that mean "not for you / not there": nothing to say to the learner. */
const SILENT = new Set([401, 403, 404]);

export function usePassport({ lessonId, active }: { lessonId: string | undefined; active: boolean }) {
  const { session, signInWithSolana } = useAuth();
  const { locale, tText } = useI18n();
  const { trails } = useTrailDashboard({ enabled: active && Boolean(session) });
  const [model, setModel] = useState<CeremonyModel | null>(null);
  const [colorIndex, setColorIndex] = useState(1);
  const startedFor = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const run = useCallback(async () => {
    if (!lessonId) return;
    const trail = trails.find((t) => t.days.some((d) => d.id === lessonId));
    const day = trail ? trail.days.findIndex((d) => d.id === lessonId) + 1 : 0;
    if (trail) {
      setColorIndex(trail.colorIndex);
      setModel({ day, totalDays: trail.days.length, trailTitle: tText(trailName(trail.title)), status: 'minting', last: day === trail.days.length, newMedals: [], txSignature: null, assetAddress: null });
    }
    try {
      const results: PassportResult[] = [];
      do results.push(await callPassport(locale));
      while (results.length < MAX_CALLS && shouldContinue(results[results.length - 1]));
      if (!alive.current) return;
      setModel(ceremonyFromResult(mergeResults(results), lessonId, locale));
    } catch (e) {
      if (!alive.current) return;
      const status = e instanceof PassportCallError ? e.status : null;
      setModel((m) => (m && !(status != null && SILENT.has(status)) ? { ...m, status: 'failed' } : null));
    }
  }, [lessonId, locale, tText, trails]);

  useEffect(() => {
    if (!active || !lessonId || !session || startedFor.current === lessonId) return;
    startedFor.current = lessonId;
    void run();
  }, [active, lessonId, session, run]);

  const connect = useCallback(async () => {
    const { error } = await signInWithSolana();
    if (!error) void run();
  }, [signInWithSolana, run]);

  return { model, colorIndex, retry: () => void run(), connect: () => void connect(), dismiss: () => setModel(null) };
}
