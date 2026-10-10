/**
 * The end of a lesson for the certification: runs the `passport` function once the lesson is whole and
 * says what to show (`utils/lessonEnd`). Nothing here claims a stamp before the server confirms it.
 * Best effort: a missing, unauthorised or broken function leaves the plain completion card.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useTrailDashboard } from '@/hooks/useTrailDashboard';
import { useI18n } from '@/i18n';
import { isGuestAccessToken } from '@/services/guestSession.service';
import { PassportCallError, callPassport } from '@/services/passport.service';
import type { PassportResult } from '@/types/achievements';
import type { PassportCall, TrailKnowledge } from '@/types/lessonEnd';
import { ceremonyFromResult, shouldContinue, type CeremonyModel } from '@/utils/ceremony';
import { lessonEndView, shouldCallPassport } from '@/utils/lessonEnd';
import { trailName } from '@/utils/trailDashboard';

const MAX_CALLS = 3;
/** Past this the learner gets the plain card and the stamp arrives on a later visit. */
export const PASSPORT_TIMEOUT_MS = 30_000;
/** How long the end of the lesson may wait for the trails before deciding without them. */
export const TRAIL_HOLD_MS = 1_500;
/** Statuses that mean "not for you / not there": nothing to say to the learner. */
const SILENT = new Set([401, 403, 404]);

class PassportTimeout extends Error {}

interface Options {
  lessonId: string | undefined;
  /** The lesson was finished in this visit, just now. */
  fresh: boolean;
  /** Activities of the lesson the player knows as completed, and how many the lesson has. */
  done: number;
  total: number;
}

/**
 * The ceremony waits for ONE mint only: the certification is always the first job, so the stamp is
 * confirmed in a single transaction. Medals earned in the same moment mint afterwards, off screen.
 */
async function callFirst(locale: string, lessonId: string): Promise<PassportResult> {
  const first = await callPassport(locale, lessonId, 1);
  if (shouldContinue(first)) void drain(locale, lessonId);
  return first;
}

async function drain(locale: string, lessonId: string): Promise<void> {
  try {
    for (let calls = 0; calls < MAX_CALLS; calls += 1) {
      if (!shouldContinue(await callPassport(locale, lessonId))) return;
    }
  } catch {
    /* best effort: whatever is left mints on the learner's next visit */
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => reject(new PassportTimeout()), ms);
    work.then(resolve, reject).finally(() => window.clearTimeout(id));
  });
}

export function usePassport({ lessonId, fresh, done, total }: Options) {
  const { session, signInWithSolana } = useAuth();
  const { locale, tText } = useI18n();
  const guest = isGuestAccessToken(session?.access_token);
  const learner = Boolean(session) && !guest;
  const dashboard = useTrailDashboard({ enabled: learner });
  const [call, setCall] = useState<PassportCall>({ state: 'idle' });
  const [dismissed, setDismissed] = useState(false);
  const [holdOver, setHoldOver] = useState(false);
  /** The last ceremony the server confirmed: a retry that brings nothing new keeps it. */
  const confirmed = useRef<CeremonyModel | null>(null);
  const startedFor = useRef<string | null>(null);
  const runId = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  const { trail, colorIndex } = useMemo((): { trail: TrailKnowledge; colorIndex: number } => {
    const found = lessonId ? dashboard.trails.find((t) => t.days.some((d) => d.id === lessonId)) : undefined;
    if (!found) return { trail: dashboard.isPending && !holdOver ? 'loading' : 'none', colorIndex: 1 };
    const at = found.days.findIndex((d) => d.id === lessonId);
    const stampedBefore = found.days.filter((d, i) => i !== at && d.total > 0 && d.done >= d.total).length;
    return {
      trail: { day: at + 1, totalDays: found.days.length, stampedBefore, trailTitle: tText(trailName(found.title)), colorIndex: found.colorIndex },
      colorIndex: found.colorIndex,
    };
  }, [dashboard.trails, dashboard.isPending, holdOver, lessonId, tText]);

  const waitingForTrails = learner && dashboard.isPending;
  useEffect(() => {
    if (!waitingForTrails) return;
    const id = window.setTimeout(() => setHoldOver(true), TRAIL_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [waitingForTrails]);

  /** `again`: a retry from inside a confirmed ceremony, which stays on screen while the call runs. */
  const run = useCallback(
    async (again: boolean) => {
      if (!lessonId) return;
      const id = ++runId.current;
      const current = () => alive.current && runId.current === id;
      const kept = again ? confirmed.current : null;
      const keep = (status: CeremonyModel['status']): PassportCall | null => (kept ? { state: 'done', result: {}, model: { ...kept, status } } : null);
      setCall(keep('minting') ?? { state: 'pending' });
      try {
        const result = await withTimeout(callFirst(locale, lessonId), PASSPORT_TIMEOUT_MS);
        if (!current()) return;
        const model = ceremonyFromResult(result, lessonId, locale);
        if (model) confirmed.current = model;
        setCall(model || !kept ? { state: 'done', result, model } : keep('failed')!);
      } catch (e) {
        if (!current()) return;
        const status = e instanceof PassportCallError ? e.status : null;
        setCall(keep('failed') ?? (e instanceof PassportTimeout ? { state: 'timeout' } : { state: 'error', silent: status != null && SILENT.has(status) }));
      }
    },
    [lessonId, locale]
  );

  const due = shouldCallPassport({ done, total });
  useEffect(() => {
    if (!due || !lessonId || !session || startedFor.current === lessonId) return;
    startedFor.current = lessonId;
    void run(false);
  }, [due, lessonId, session, run]);

  const connect = useCallback(async () => {
    const { error } = await signInWithSolana();
    if (!error) void run(true);
  }, [signInWithSolana, run]);

  const view = lessonEndView({ learner, done, total, fresh: fresh && learner, trail, call, dismissed });
  return { view, colorIndex, retry: () => void run(true), connect: () => void connect(), dismiss: () => setDismissed(true) };
}

/** Reads the trails while the lesson runs, so its end already knows which day this is. Renders nothing. */
export function usePassportPrefetch(): void {
  const { session } = useAuth();
  useTrailDashboard({ enabled: Boolean(session) && !isGuestAccessToken(session?.access_token) });
}
