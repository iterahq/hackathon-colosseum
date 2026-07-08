/**
 * Live-class session page (`/live/:sessionId`) — the STUDENT surface of the
 * real-time cohort mode (plan 20260702-…).
 *
 * Reuses the EXACT same activity components as the solo player: the immersive
 * chrome (full-width bar + X + hearts) + <ActivityRenderer>. The ONLY difference
 * is the synchronicity layer — the activity on screen derives from the session's
 * server-authoritative `current_activity_id` (via useClassSession) instead of a
 * local `index`. Learner-driven advance is NEUTERED (Kahoot force-advance): when
 * the professor advances, everyone jumps; a student mid-activity loses it.
 *
 * Result writes are UNCHANGED (persistActivityProgress → itera.progress /
 * activity_results). Live mode only controls WHICH activity is on screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Radio, Loader2 } from 'lucide-react';
import { LiveReception } from '@/components/live/LiveReception';
import { LiveSessionChrome } from '@/components/live/LiveSessionChrome';
import { LiveActivityStage } from '@/components/live/LiveActivityStage';
import { LiveTimer } from '@/components/live/LiveTimer';
import { LiveStopwatch } from '@/components/live/LiveStopwatch';
import { LiveSidebar } from '@/components/live/LiveSidebar';
import { useLessonContent } from '@/hooks';
import { useClassSession } from '@/hooks/useClassSession';
import { useIteraIdentity } from '@/hooks/useIteraIdentity';
import { useLiveSound } from '@/hooks/useLiveSound';
import { useI18n } from '@/i18n';
import { persistActivityProgress } from '@/services/progress.service';
import { mergeLiveAnswers } from '@/utils/mergeLiveAnswers';
import { formatDuration } from '@/utils/formatDuration';
import type { Activity } from '@/types/content';
import type { ClassCompleter } from '@/types/liveClass';


export default function LiveSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { t, tText } = useI18n();

  const identity = useIteraIdentity();
  const { session, currentActivityId, status, roster, connected, loading, timer, answers, broadcastAnswer } =
    useClassSession(
      sessionId,
      identity.userId
        ? { userId: identity.userId, name: identity.name, isInstructor: false }
        : undefined
    );

  const { data: lesson, isPending: lessonPending } = useLessonContent(session?.lessonId);
  const lessonLoaded = Boolean(lesson);
  const activities = useMemo<Activity[]>(() => lesson?.activities ?? [], [lesson]);

  // Peers' live progress on the current activity — sourced from the broadcast
  // answers (learners can't read others' rows under RLS), mapped over the present
  // learner roster.
  const peerAnswerers = useMemo(() => {
    const learners: ClassCompleter[] = roster
      .filter((m) => !m.isInstructor)
      .map((m) => ({ userId: m.userId, name: m.name, done: false }));
    return mergeLiveAnswers(learners, currentActivityId ? answers[currentActivityId] : undefined);
  }, [roster, answers, currentActivityId]);

  const current = useMemo(
    () => activities.find((a) => a.id === currentActivityId) ?? null,
    [activities, currentActivityId]
  );

  // Redirect instructor to the instructor control surface — never show them the
  // student view. Handles "re-entry" after accidentally navigating here directly.
  useEffect(() => {
    if (session && identity.userId && session.instructorId === identity.userId) {
      navigate('/live/instructor', { replace: true });
    }
  }, [session, identity.userId, navigate]);

  const sound = useLiveSound();

  // Play the advance cue when the professor moves the class to a NEW activity
  // (not on first mount / leaving reception).
  const prevActivityRef = useRef<string | null>(null);
  const { onAdvance } = sound;
  useEffect(() => {
    const prev = prevActivityRef.current;
    if (currentActivityId && prev && prev !== currentActivityId) onAdvance();
    prevActivityRef.current = currentActivityId;
  }, [currentActivityId, onAdvance]);

  // Per-activity local answer state (result writes stay per-user) + the moment
  // the current activity opened for THIS learner (the elapsed-time origin). Both
  // reset whenever the professor force-advances to a different activity.
  const [answered, setAnswered] = useState<{ id: string; correct: boolean; elapsedMs: number } | null>(
    null
  );
  const [activityStartedAt, setActivityStartedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // The activity id whose countdown expired (locks that activity for the learner).
  // Keyed on the id — NOT a bare boolean — so an advance right after a timeout
  // never paints the NEXT activity as locked for a frame while an effect catches up.
  const [timeUpFor, setTimeUpFor] = useState<string | null>(null);
  useEffect(() => {
    setAnswered(null);
    setSaving(false);
    setTimeUpFor(null);
    setActivityStartedAt(currentActivityId ? Date.now() : null);
  }, [currentActivityId]);

  // Time ran out before the learner answered THIS activity → it's locked.
  const locked = timeUpFor !== null && timeUpFor === current?.id && !answered;

  const { onTimeUp } = sound;
  const handleTimeUp = useCallback(() => {
    onTimeUp();
    setTimeUpFor(currentActivityId);
  }, [onTimeUp, currentActivityId]);

  async function handleComplete(correct: boolean) {
    if (!current || saving || locked || answered?.id === current.id) return;
    // Force-advance model: answering does NOT move the student forward — only the
    // professor's pointer advances. We persist a correct result, and broadcast
    // EVERY answer (right or wrong) + how long the learner took, so the professor
    // sees who responded and their time.
    const elapsedMs = activityStartedAt ? Date.now() - activityStartedAt : 0;
    setAnswered({ id: current.id, correct, elapsedMs });
    sound.onAnswer(correct);
    if (correct) {
      setSaving(true);
      await persistActivityProgress(current.id);
      setSaving(false);
    }
    broadcastAnswer(current.id, correct, elapsedMs);
  }

  const progressPct = activities.length
    ? Math.round(
        ((currentActivityId ? activities.findIndex((a) => a.id === currentActivityId) + 1 : 0) /
          activities.length) *
          100
      )
    : 0;

  const ended = status === 'ended';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Immersive chrome — shared verbatim with the instructor surface. */}
      <LiveSessionChrome
        progressPct={progressPct}
        connected={connected}
        presenceCount={roster.length}
        ended={ended}
        onClose={() => navigate('/')}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <main className="flex-1 lg:overflow-y-auto px-4 md:px-8 pt-14 md:pt-20 pb-8">
          <div className="max-w-2xl mx-auto">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p>{t('live.connecting')}</p>
          </div>
        ) : !session ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground" data-testid="live-not-found">
            {t('live.notFound')}
          </div>
        ) : ended ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-border bg-card p-10 text-center max-w-xl mx-auto"
            data-testid="live-ended"
          >
            <div className="w-20 h-20 mx-auto rounded-3xl bg-clay/10 border border-clay/40 flex items-center justify-center">
              <Radio className="w-9 h-9 text-clay" />
            </div>
            <h2 className="font-display text-foreground mt-5">{t('live.ended.title')}</h2>
            <p className="text-sm text-muted-foreground mt-2">{t('live.ended.subtitle')}</p>
            <button
              onClick={() => navigate('/')}
              className="mt-6 w-full h-12 px-6 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
            >
              {t('live.ended.cta')}
            </button>
          </motion.div>
        ) : (
          <>
            <div
              className="font-mono text-[11px] uppercase tracking-wider text-clay"
              data-testid="live-eyebrow"
            >
              {t('live.eyebrow')}
            </div>
            <h1
              className="font-display font-bold text-3xl md:text-4xl text-foreground mt-1.5"
              data-testid="live-title"
            >
              {tText(lesson?.title)}
            </h1>

            {current ? null : !currentActivityId ? (
              // No pointer — the class is in RECEPTION until the instructor begins.
              // The durable read completed under `loading`, so a null pointer here
              // is real (not a not-yet-loaded flicker) — show the reception, never
              // an activity skeleton (which would wrongly signal "an activity is
              // coming").
              <LiveReception roster={roster} />
            ) : lessonPending ? (
              // Pointer set and the lesson content is still resolving (late-join /
              // reconnect) — activity SKELETON so a joiner with a live pointer goes
              // straight to the activity once it lands. (loop-1 fix #3.)
              <div className="mt-7 space-y-4" data-testid="live-activity-skeleton" aria-busy="true">
                <div className="h-6 w-2/3 rounded-lg ds-shimmer" />
                <div className="h-40 rounded-2xl ds-shimmer" />
                <div className="h-12 rounded-full ds-shimmer" />
              </div>
            ) : !lessonLoaded || activities.length === 0 ? (
              // The lesson read SETTLED with no readable content — the class was
              // started on content this learner can't access (e.g. another tenant's
              // program, RLS-blocked). Show a clear message instead of an endless
              // skeleton (which reads as a black screen).
              <div
                className="mt-8 rounded-3xl border border-dashed border-clay/40 bg-clay/5 p-12 text-center"
                data-testid="live-unavailable"
              >
                <p className="font-display text-lg text-foreground">{t('live.unavailable.title')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('live.unavailable.subtitle')}</p>
              </div>
            ) : (
              // Lesson loaded with activities, pointer set, but this activity isn't
              // in the list yet (transient pointer/lesson mismatch) — brief skeleton.
              <div className="mt-7 space-y-4" data-testid="live-activity-skeleton" aria-busy="true">
                <div className="h-6 w-2/3 rounded-lg ds-shimmer" />
                <div className="h-40 rounded-2xl ds-shimmer" />
                <div className="h-12 rounded-full ds-shimmer" />
              </div>
            )}
            {current && (
              <LiveActivityStage
                activity={{
                  ...current,
                  status: answered?.id === current.id && answered.correct ? 'done' : current.status,
                }}
                readOnly={locked || answered?.id === current.id}
                onComplete={handleComplete}
                onSubmit={sound.onSubmit}
                timerSlot={
                  (timer && timer.activityId === current.id) ||
                  (!answered && !locked && activityStartedAt) ? (
                    <>
                      {timer && timer.activityId === current.id && (
                        <LiveTimer deadline={timer.deadline} onExpire={handleTimeUp} onWarn={sound.onWarn} />
                      )}
                      {!answered && !locked && activityStartedAt && (
                        <LiveStopwatch startedAt={activityStartedAt} />
                      )}
                    </>
                  ) : undefined
                }
                footer={
                  <>
                    {locked && (
                      <p className="mt-5 text-center text-sm text-destructive" data-testid="live-locked-hint">
                        {t('live.timer.lockedHint')}
                      </p>
                    )}
                    {answered?.id === current.id && (
                      <p
                        className={`mt-5 text-center text-sm ${answered.correct ? 'text-menta' : 'text-clay'}`}
                        data-testid="live-answered-hint"
                        data-correct={answered.correct ? 'true' : 'false'}
                      >
                        {answered.correct ? t('live.done.waitForNext') : t('live.wrong.waitForNext')}{' '}
                        <span className="text-muted-foreground" data-testid="live-answered-elapsed">
                          · {t('live.elapsed.you', { time: formatDuration(answered.elapsedMs / 1000) })}
                        </span>
                      </p>
                    )}
                  </>
                }
              />
            )}
          </>
        )}
          </div>
        </main>

        {!loading && session && !ended && current && (
          <LiveSidebar
            role="learner"
            roster={roster}
            answerers={peerAnswerers}
            selfUserId={identity.userId}
          />
        )}
      </div>
    </div>
  );
}
