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
import { Loader2 } from 'lucide-react';
import { LiveReception } from '@/components/live/LiveReception';
import { LiveNameGate } from '@/components/live/LiveNameGate';
import { LiveSessionChrome } from '@/components/live/LiveSessionChrome';
import { LiveActivityStage } from '@/components/live/LiveActivityStage';
import { FeedbackFooter } from '@/components/branded/activity/FeedbackFooter';
import {
  isFooterGradedKind,
  type FooterResult,
} from '@/components/branded/activity/activityFeedbackKinds';
import { LiveTimer } from '@/components/live/LiveTimer';
import { LiveStopwatch } from '@/components/live/LiveStopwatch';
import { LiveSidebar } from '@/components/live/LiveSidebar';
import { useLessonContent } from '@/hooks';
import { useClassSession } from '@/hooks/useClassSession';
import { useIteraIdentity } from '@/hooks/useIteraIdentity';
import { useLiveSound } from '@/hooks/useLiveSound';
import { useI18n } from '@/i18n';
import { persistActivityProgress } from '@/services/progress.service';
import { recordClassAttendance, recordClassAnswer } from '@/services/classReport.service';
import { mergeLiveAnswers } from '@/utils/mergeLiveAnswers';
import { rankByScore } from '@/utils/rankByScore';
import { learnerActivityGate } from '@/utils/liveActivityGate';
import { LivePodium } from '@/components/live/LivePodium';
import { LiveHandButton } from '@/components/live/LiveHandButton';
import { LiveSoundDock } from '@/components/live/LiveSoundDock';
import { LiveReconnectBanner } from '@/components/live/LiveReconnectBanner';
import { formatDuration } from '@/utils/formatDuration';
import { readStoredAnswer, storeAnswer } from '@/utils/liveAnswerStorage';
import { isGenericName } from '@/utils/isGenericName';
import { useMembership } from '@/hooks/useMembership';
import { isInstructor as isStaffInstructor } from '@/services/membership.service';
import { useProfile } from '@/hooks/useProfile';
import type { Activity } from '@/types/content';
import type { ClassCompleter } from '@/types/liveClass';


export default function LiveSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { t, tText } = useI18n();

  const identity = useIteraIdentity();
  // Staff (instructor/admin/owner) who lands on the student surface must still
  // present as instructor — otherwise their presence enters the podium/ranking.
  const { data: memberships } = useMembership();
  const staff = isStaffInstructor(memberships ?? []);
  const { session, currentActivityId, status, roster, connected, reconnecting, loading, timer, stoppedFor, answers, elapsed, broadcastAnswer, setHandRaised } =
    useClassSession(
      sessionId,
      identity.userId
        ? { userId: identity.userId, name: identity.name, avatarUrl: identity.avatarUrl, isInstructor: staff }
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
      .map((m) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, done: false }));
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

  // Durable attendance row (first join wins) — best-effort, never blocks the UI.
  useEffect(() => {
    if (session?.id && identity.userId && status === 'live') {
      void recordClassAttendance(session.id);
    }
  }, [session?.id, identity.userId, status]);

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
  // Raised hand (presence-tracked). Auto-lowers whenever the class advances.
  const [handRaised, setHandRaisedLocal] = useState(false);
  const toggleHand = useCallback(() => {
    setHandRaisedLocal((prev) => {
      setHandRaised(!prev);
      return !prev;
    });
  }, [setHandRaised]);
  useEffect(() => {
    // Restore the learner's own persisted answer (refresh protection) — a page
    // reload must NOT re-open an answered activity nor re-fire its broadcast.
    const stored =
      sessionId && currentActivityId ? readStoredAnswer(sessionId, currentActivityId) : null;
    setAnswered(stored && currentActivityId ? { id: currentActivityId, ...stored } : null);
    setSaving(false);
    setTimeUpFor(null);
    setHandRaisedLocal(false);
    setHandRaised(false);
    setActivityStartedAt(currentActivityId ? Date.now() : null);
  }, [sessionId, currentActivityId, setHandRaised]);

  const { onTimeUp } = sound;
  const handleTimeUp = useCallback(() => {
    // Already answered THIS activity → no "time's up" sound (only the lock).
    if (answered?.id !== currentActivityId) onTimeUp();
    setTimeUpFor(currentActivityId);
  }, [onTimeUp, currentActivityId, answered]);

  // Professor stopped the timer → lock + reveal the correct answer for everyone.
  useEffect(() => {
    if (stoppedFor && current && stoppedFor === current.id) setTimeUpFor(current.id);
  }, [stoppedFor, current]);

  const timerRunning = Boolean(timer && current && timer.activityId === current.id);
  const expired = timeUpFor !== null && timeUpFor === current?.id;
  const hasAnswered = answered?.id === current?.id;
  const gate = learnerActivityGate({
    timerRunning,
    expired,
    answered: hasAnswered,
  });
  const { started, locked } = gate;

  async function handleComplete(correct: boolean) {
    if (!current || saving || !gate.canComplete) return;
    // Force-advance model: answering does NOT move the student forward — only the
    // professor's pointer advances. We persist a correct result, and broadcast
    // EVERY answer (right or wrong) + how long the learner took, so the professor
    // sees who responded and their time.
    const elapsedMs = activityStartedAt ? Date.now() - activityStartedAt : 0;
    setAnswered({ id: current.id, correct, elapsedMs });
    if (sessionId) storeAnswer(sessionId, current.id, { correct, elapsedMs });
    sound.onAnswer(correct);
    if (correct) {
      setSaving(true);
      await persistActivityProgress(current.id);
      setSaving(false);
    }
    broadcastAnswer(current.id, correct, elapsedMs);
    // Durable copy (right AND wrong) for the post-class report — best-effort.
    if (sessionId) void recordClassAnswer(sessionId, current.id, correct, elapsedMs);
  }

  const activityIdx = currentActivityId ? activities.findIndex((a) => a.id === currentActivityId) : -1;
  const progressPct = activities.length
    ? Math.round(((activityIdx >= 0 ? activityIdx + 1 : 0) / activities.length) * 100)
    : 0;

  const ended = status === 'ended';
  const podiumRanking = useMemo(() => rankByScore(roster, elapsed, answers), [roster, elapsed, answers]);

  // Restart the personal stopwatch whenever a timer round starts, so the
  // podium's elapsed time reflects the timed round rather than time spent
  // idling on the activity before the professor armed it.
  useEffect(() => {
    if (started && !answered) setActivityStartedAt(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Pre-class name+avatar step: shown once when the learner has no real name yet
  // (Itera override). Skipped while the profile query is still resolving so a
  // real name never flashes the gate.
  const { data: profile, isLoading: profileLoading } = useProfile();
  const [gatePassed, setGatePassed] = useState(false);
  const gateNeeded =
    Boolean(session) &&
    !ended &&
    !gatePassed &&
    !profileLoading &&
    isGenericName(profile?.displayName, profile?.email);

  // The sandbox owns a fixed viewport-relative height, so its surface is pinned
  // to the viewport with the scroll living INSIDE the stage — never the page.
  const onSandbox = current?.kind === 'sandbox_scenario';

  // Global fixed feedback footer (Duolingo pattern), shared with the async
  // player. In LIVE mode the learner does NOT self-advance (the instructor
  // force-advances the cohort), so the footer shows the green/red signal + the
  // "wait for the next one" hint instead of a CTA. Driven off the durable
  // `answered` state (so it survives a reload), gated to the footer-graded kinds
  // — now including `sandbox_scenario` (Tainan 2026-07-18): the sandbox's
  // terminal verdict rides the same wait-mode footer as the MCQ family, its
  // in-window reveal recap/outcome panel stays, and the below-stage hint moves
  // into the footer.
  const footerGraded = isFooterGradedKind(current?.kind);
  const answeredHere = Boolean(current && answered?.id === current.id);
  const footerResult: FooterResult | null =
    footerGraded && answeredHere && answered ? { correct: answered.correct } : null;
  const answeredWaitHint = answered ? (
    <span
      className={answered.correct ? 'text-menta' : 'text-clay'}
      data-testid="live-answered-hint"
      data-correct={answered.correct ? 'true' : 'false'}
    >
      {answered.correct ? t('live.done.waitForNext') : t('live.wrong.waitForNext')}{' '}
      <span className="text-muted-foreground" data-testid="live-answered-elapsed">
        · {t('live.elapsed.you', { time: formatDuration(answered.elapsedMs / 1000) })}
      </span>
    </span>
  ) : undefined;

  return (
    <div className={`bg-background flex flex-col ${onSandbox ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'}`}>
      <LiveReconnectBanner show={reconnecting} />
      {/* Immersive chrome — shared verbatim with the instructor surface. */}
      <LiveSessionChrome
        progressPct={progressPct}
        connected={connected}
        presenceCount={roster.length}
        ended={ended}
        activityIndex={activityIdx}
        activityCount={activities.length}
        timerSlot={
          timerRunning && timer && current ? (
            <LiveTimer prominent deadline={timer.deadline} onExpire={handleTimeUp} onWarn={sound.onWarn} />
          ) : undefined
        }
        onClose={() => navigate('/')}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <main
          className={`flex-1 min-h-0 px-4 md:px-8 ${
            onSandbox ? 'overflow-y-auto pt-6 pb-6' : 'lg:overflow-y-auto pt-14 md:pt-20'
          } ${footerResult ? 'pb-40' : onSandbox ? '' : 'pb-8'}`}
        >
          <div className={`mx-auto ${current?.kind === 'sandbox_scenario' ? 'max-w-4xl' : 'max-w-2xl'}`}>
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
            className="rounded-3xl border border-border bg-card p-8 md:p-10 max-w-xl mx-auto"
            data-testid="live-ended"
          >
            <LivePodium ranking={podiumRanking} />
            <button
              onClick={() => navigate('/')}
              className="mt-8 w-full h-12 px-6 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
            >
              {t('live.ended.cta')}
            </button>
          </motion.div>
        ) : gateNeeded ? (
          <LiveNameGate
            initialName={isGenericName(profile?.displayName, profile?.email) ? '' : profile?.displayName ?? ''}
            initialAvatarUrl={profile?.avatarUrl}
            onDone={() => setGatePassed(true)}
          />
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
                readOnly={gate.readOnly}
                reveal={timeUpFor !== null && timeUpFor === current.id}
                onComplete={handleComplete}
                onSubmit={sound.onSubmit}
                timerSlot={
                  // The countdown now lives prominently in the top chrome; here we
                  // only keep the personal stopwatch (elapsed) once the activity is
                  // started and still unanswered.
                  !answered && !locked && activityStartedAt ? (
                    <LiveStopwatch startedAt={activityStartedAt} />
                  ) : undefined
                }
                footer={
                  <>
                    {locked && (
                      <p className="mt-5 text-center text-sm text-destructive" data-testid="live-locked-hint">
                        {t('live.timer.lockedHint')}
                      </p>
                    )}
                    {/* For GRADED (MCQ) kinds the answered hint moves into the
                        global fixed FeedbackFooter below. Non-graded kinds (the
                        sandbox) keep it inline here so their below-stage hint
                        isn't lost. */}
                    {!footerGraded && answered?.id === current.id && (
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
            ranking={podiumRanking}
            selfUserId={identity.userId}
            hasActivity={!!current}
            kind={current?.kind ?? ''}
          />
        )}
      </div>

      {!loading && session && <LiveSoundDock />}

      {!loading && session && !ended && current && (
        <LiveHandButton raised={handRaised} onToggle={toggleHand} />
      )}

      {/* ── Global fixed answer-feedback footer (Duolingo pattern) ──
          Live/force-advance mode: green/red + the "wait for the next one" hint
          (no self-advance CTA — the instructor advances the cohort). */}
      {!ended && <FeedbackFooter result={footerResult} waitHint={answeredWaitHint} />}
    </div>
  );
}
