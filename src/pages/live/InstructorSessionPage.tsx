/**
 * Professor control surface for ONE session (`/live/instructor/:sessionId`) —
 * the deep-linkable, reloadable instructor view of a specific live class (plan
 * 20260723-itera-live-routed-session-and-index). Instructor-gated (RequireRole).
 *
 * The session is loaded BY ROUTE ID (useClassSessionById) instead of being
 * resolved implicitly as "the current live one" — so a professor has a stable
 * URL for a class, can reopen it, and a page reload keeps the same session.
 *
 * Guards (ADR — Open Question #3): a session that doesn't exist / isn't visible
 * (RLS) OR was ALREADY ended when the page loaded → redirect to the index
 * (`/live/instructor`) with a notice, never a 404. A session that ENDS *while*
 * being presented is NOT bounced — ClassControl shows its podium (the guard only
 * reads the INITIAL status).
 *
 * The live control panel (ClassControl) is unchanged from the old inline render
 * in InstructorClassPage — only its home became a routed page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, MonitorUp } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useIteraIdentity } from '@/hooks/useIteraIdentity';
import { useLessonContent } from '@/hooks';
import { useClassCompleters, useClassSessionById } from '@/hooks/useLiveClass';
import { useClassSession } from '@/hooks/useClassSession';
import { queryKeys } from '@/lib/queryKeys';
import {
  advanceClassSession,
  endClassSession,
  type ClassSession,
} from '@/services/liveClass.service';
import { columnMaxWidthClass, LIVE_COLUMN_OVERRIDES } from '@/utils/activityColumnWidth';
import { mergeLiveAnswers } from '@/utils/mergeLiveAnswers';
import { rankByScore } from '@/utils/rankByScore';
import { mergeSeenLearners } from '@/utils/liveRoster';
import { isByocActivity } from '@/components/branded/activity/byoc/byocSpec';
import { hasRevealableAnswer } from '@/utils/isAnswerableLiveKind';
import { liveTimerSeconds } from '@/utils/liveTimerSeconds';
import { remainingSeconds, extendedTimerSeconds } from '@/utils/addLiveTime';
import { buildStagePickerLearners } from '@/utils/stagePickerLearners';
import { LivePodium } from '@/components/live/LivePodium';
import { LiveTimer } from '@/components/live/LiveTimer';
import { LiveReception } from '@/components/live/LiveReception';
import { LiveSessionChrome } from '@/components/live/LiveSessionChrome';
import { LiveSoundDock } from '@/components/live/LiveSoundDock';
import { LiveActivityStage } from '@/components/live/LiveActivityStage';
import { LiveStage } from '@/components/live/LiveStage';
import { LiveStagePicker } from '@/components/live/LiveStagePicker';
import { InstructorControls } from '@/components/live/InstructorControls';
import { LiveSidebar } from '@/components/live/LiveSidebar';
import { LiveReconnectBanner } from '@/components/live/LiveReconnectBanner';
import { useLiveSound } from '@/hooks/useLiveSound';
import type { Activity } from '@/types/content';
import type { ClassPresenceMember, StagePickerLearner } from '@/types/liveClass';

// The countdown duration is resolved PER ACTIVITY by `liveTimerSeconds`:
// per-kind default (code = 5 min, everything else 1 min) with an optional
// `spec.timer_seconds` override. Backlog: a selector at class creation.

export default function InstructorSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const identity = useIteraIdentity();
  const { data: session, isPending } = useClassSessionById(sessionId);

  // The guard reads the INITIAL status only. A session that is already `ended`
  // when the page loads (deep link to a finished class) bounces to the index;
  // but a live session that ENDS while being presented must reach ClassControl's
  // podium, not get redirected mid-flow. Freeze the first non-pending verdict.
  const initialEndedRef = useRef<boolean | null>(null);
  if (session && initialEndedRef.current === null) {
    initialEndedRef.current = session.status === 'ended';
  }

  const backToIndex = useCallback(
    () => navigate('/live/instructor', { replace: true }),
    [navigate]
  );

  if (isPending) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center"
        data-testid="instructor-session-loading"
      >
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not visible / not found (RLS-blocked or deleted) → index with a notice.
  if (!session) {
    return (
      <Navigate to="/live/instructor" replace state={{ liveNotice: 'notFound' }} />
    );
  }

  // Already ended on load → index with the "already ended" notice (ADR / Q#3).
  if (initialEndedRef.current) {
    return <Navigate to="/live/instructor" replace state={{ liveNotice: 'ended' }} />;
  }

  return (
    <ClassControl
      session={session}
      tenantId={session.tenantId}
      instructorId={identity.userId}
      instructorName={identity.name}
      instructorAvatarUrl={identity.avatarUrl}
      onEnded={backToIndex}
    />
  );
}

/* ── Live control panel ─────────────────────────────────────────────────── */

function ClassControl({
  session,
  tenantId,
  instructorId,
  instructorName,
  instructorAvatarUrl,
  onEnded,
}: {
  session: ClassSession;
  tenantId: string;
  instructorId: string | null;
  instructorName: string;
  instructorAvatarUrl: string | null;
  onEnded: () => void;
}) {
  const { t, tText } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { currentActivityId, status, roster, connected, reconnecting, answers, elapsed, timer, stoppedFor, stagedAnswer, stagePendingUserId, stageUnreachableUserId, broadcast, broadcastTimer, clearTimer, requestStage, clearStage, refetch } =
    useClassSession(
      session.id,
      instructorId
        ? { userId: instructorId, name: instructorName, avatarUrl: instructorAvatarUrl, isInstructor: true }
        : undefined
    );
  const sound = useLiveSound();
  const { data: lesson, isPending: lessonPending } = useLessonContent(session.lessonId);
  const activities = useMemo<Activity[]>(() => lesson?.activities ?? [], [lesson]);

  // Armed only when THIS instructor ends the class, so an out-of-band end still bounces.
  const [showPodium, setShowPodium] = useState(false);

  // If the session ends out-of-band (another tab/device), leave the live
  // surface — never strand the professor in a "LIVE" chrome whose controls
  // silently no-op. onEnded() bounces back to the index.
  useEffect(() => {
    if (status === 'ended' && !showPodium) onEnded();
  }, [status, onEnded, showPodium]);

  const idx = useMemo(
    () => activities.findIndex((a) => a.id === currentActivityId),
    [activities, currentActivityId]
  );
  const current = idx >= 0 ? activities[idx] : null;

  // Scope "who's done" to the live presence roster (students actually in the
  // room) — the denominator is present-first, not the whole tenant cohort, and
  // absent learners' names never leak into the live view. (loop-1 fix #2.)
  const presentUserIds = useMemo(() => roster.map((m) => m.userId), [roster]);
  const { data: polled = [] } = useClassCompleters(
    tenantId,
    currentActivityId,
    presentUserIds,
    session.startedAt
  );
  // Presence-first: everyone in the room appears (as pending / 0 answers) even
  // before they answer the first activity; the polled DB read only UPGRADES
  // done-state + names/avatars for tenant learners it knows.
  const answerers = useMemo(() => {
    const polledById = new Map(polled.map((c) => [c.userId, c]));
    const base = roster
      .filter((m) => !m.isInstructor)
      .map(
        (m) =>
          polledById.get(m.userId) ?? {
            userId: m.userId,
            name: m.name,
            avatarUrl: m.avatarUrl,
            done: false,
          }
      );
    return mergeLiveAnswers(
      base,
      currentActivityId ? answers[currentActivityId] : undefined,
      currentActivityId ? elapsed[currentActivityId] : undefined
    );
  }, [roster, polled, answers, elapsed, currentActivityId]);

  // Learners pullable to the stage: EVERYONE present (ADR-4 revised — the
  // professor follows work in progress too), each tagged concluiu / em andamento
  // / não começou so the choice is informed instead of blind.
  const stageLearners = useMemo<StagePickerLearner[]>(
    () =>
      buildStagePickerLearners(
        roster,
        currentActivityId,
        currentActivityId ? answers[currentActivityId] : undefined
      ),
    [roster, answers, currentActivityId]
  );

  // Every learner who was EVER present — presence drains on `leave` (students
  // disconnect the instant the class ends), which would empty the live roster
  // and make the final podium vanish. Accumulating here keeps their names.
  const seenLearnersRef = useRef<Map<string, ClassPresenceMember>>(new Map());
  useEffect(() => {
    seenLearnersRef.current = mergeSeenLearners(seenLearnersRef.current, roster);
  }, [roster]);

  // Frozen podium data, captured the moment the class ends. Rendering the podium
  // off live state would let it drain to empty as students leave; the snapshot
  // pins the final standings. (Bug: "ranking não aparece ao encerrar a aula".)
  const [podiumSnapshot, setPodiumSnapshot] = useState<{
    roster: ClassPresenceMember[];
    elapsed: typeof elapsed;
    answers: typeof answers;
  } | null>(null);
  // Live ranking for the sidebar. Merges the CURRENT roster in directly (not
  // just the ref) so a fresh joiner appears immediately — the ref-updating
  // effect runs after render, and the ref alone isn't a memo dependency.
  const liveRanking = useMemo(
    () =>
      rankByScore(
        [...mergeSeenLearners(seenLearnersRef.current, roster).values()],
        elapsed,
        answers
      ),
    [roster, elapsed, answers]
  );
  const podiumRanking = useMemo(() => {
    if (!podiumSnapshot) return liveRanking;
    return rankByScore(podiumSnapshot.roster, podiumSnapshot.elapsed, podiumSnapshot.answers);
  }, [podiumSnapshot, liveRanking]);
  // Learners still in the ranking (seen at least once) but no longer in the live
  // roster = they dropped the call. The sidebar blinks their row so the professor
  // notices, instead of them silently vanishing from the list.
  const disconnectedUserIds = useMemo(() => {
    const live = new Set(roster.map((m) => m.userId));
    return [...seenLearnersRef.current.keys()].filter((uid) => !live.has(uid));
  }, [roster]);

  // Reveal the answer on the professor's own mirror when the timer stops (manual
  // stop → stoppedFor via self-broadcast; natural expiry → expiredFor).
  const [expiredFor, setExpiredFor] = useState<string | null>(null);
  const handleInstructorExpire = useCallback(() => {
    sound.onTimeUp();
    setExpiredFor(currentActivityId);
  }, [sound, currentActivityId]);
  // Revisiting an activity (prev/next) must NOT auto-reveal from a stale expiry.
  useEffect(() => setExpiredFor(null), [currentActivityId]);
  // Restarting the clock (fresh future-deadline timer for THIS activity) lifts
  // the reveal so the professor's mirror re-opens alongside the learners'.
  useEffect(() => {
    if (timer && current && timer.activityId === current.id && timer.deadline > Date.now()) {
      setExpiredFor((prev) => (prev === current.id ? null : prev));
    }
  }, [timer, current]);
  const revealCurrent = Boolean(current && (stoppedFor === current.id || expiredFor === current.id));

  // Seconds the professor added while the clock was STOPPED — folded into the
  // next start's duration (so the start button label already shows the total).
  // Reset per activity, and consumed the moment the timer actually launches.
  const [timerBonus, setTimerBonus] = useState(0);
  useEffect(() => setTimerBonus(0), [currentActivityId]);
  const timerActive = Boolean(timer && current && timer.activityId === current.id);
  const baseTimerSeconds = liveTimerSeconds(current?.kind, current?.spec);

  // The professor's "+tempo" popover ADDS seconds — never sets. Running →
  // extend the live remaining and re-broadcast through the SAME timer channel
  // (broadcastTimer) so the whole class sees the countdown grow. Stopped →
  // grow the next start's duration.
  const handleAddTime = useCallback(
    (addSeconds: number) => {
      if (!current || addSeconds <= 0) return;
      if (timer && timer.activityId === current.id) {
        // Running: extend the LIVE remaining and re-broadcast a fresh deadline
        // through the SAME channel the start uses — the class sees it grow.
        const left = remainingSeconds(timer.deadline, Date.now());
        broadcastTimer(current.id, extendedTimerSeconds(left, addSeconds));
      } else {
        // Stopped: fold into the next start's duration (start button reflects it).
        setTimerBonus((b) => b + addSeconds);
      }
    },
    [current, timer, broadcastTimer]
  );

  const [busy, setBusy] = useState(false);

  // O picker abre DENTRO da sidebar, e o mesmo botão fecha. Modal cobria a aula
  // inteira só pra escolher um aluno. Fecha sozinho quando o puxão chega, pra
  // cair direto na tela do aluno (B9 view mode).
  const [stageOpen, setStageOpen] = useState(false);
  // Gate pelo ALUNO no palco, não pelo objeto: o aluno re-emite o trabalho a cada
  // tecla, e cada `stage-show` cria um `stagedAnswer` novo — fechar por identidade
  // de objeto arrancaria a lista da mão do professor a cada digitação.
  const stagedUserId = stagedAnswer?.author.userId ?? null;
  useEffect(() => {
    if (stagedUserId) setStageOpen(false);
  }, [stagedUserId]);

  async function goTo(activityId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await advanceClassSession(session.id, activityId); // durable
      broadcast(activityId); // fast path
      refetch();
      void queryClient.invalidateQueries({ queryKey: queryKeys.liveClass.mySessions(tenantId) });
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd() {
    if (busy) return;
    setBusy(true);
    try {
      await endClassSession(session.id);
      // Freeze the standings NOW, while presence is still full, so students
      // disconnecting can't drain the podium out from under the professor.
      setPodiumSnapshot({
        roster: [...seenLearnersRef.current.values()],
        elapsed,
        answers,
      });
      // Defer invalidation to handleLeavePodium; doing it now unmounts this control before the podium renders.
      setShowPodium(true);
    } finally {
      setBusy(false);
    }
  }

  function handleLeavePodium() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.liveClass.mySessions(tenantId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.liveClass.active });
    // Back to the open-classes index (the professor's home) — the just-ended
    // class now surfaces under "Aulas encerradas" there.
    onEnded();
  }

  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < activities.length - 1;

  // Shareable direct-join link (loop-2 fix #6, instructor affordance): a copyable
  // `/live/:id` URL the professor can drop into chat so students jump straight in.
  const [copied, setCopied] = useState(false);
  const joinUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/live/${session.id}` : `/live/${session.id}`;
  async function copyJoinLink() {
    try {
      await navigator.clipboard?.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  // Pointer-based progress for the shared chrome bar (same visual language the
  // learners get). Reception (idx < 0) shows an empty bar.
  const progressPct =
    activities.length && idx >= 0 ? Math.round(((idx + 1) / activities.length) * 100) : 0;
  const ended = status === 'ended';
  const onPodium = ended || showPodium;
  // Begin exists ONLY before a pointer is set; once set we're in the activity
  // (or briefly its loading skeleton), never back in the lobby.
  const inReception = !currentActivityId;
  const lessonLoading = Boolean(currentActivityId) && !current && lessonPending;
  // Present learners who have answered the current activity — powers the
  // "advance now" cue on the control bar (the professor's version of watching
  // the room fill in, without looking away from the stage).
  const answeredCount = answerers.filter((a) => a.state !== 'pending').length;
  const presentCount = answerers.length;

  return (
    // Full-screen immersive surface — the SAME chrome + stage the learners see
    // (Tainan: "igual à do aluno, só que com mais controles"). The only extra is
    // the fixed presenter bar at the bottom; on screen-share the cohort sees this.
    <div className="min-h-screen bg-background flex flex-col" data-testid="instructor-control">
      <LiveReconnectBanner show={reconnecting} />
      <LiveSessionChrome
        progressPct={progressPct}
        connected={connected}
        presenceCount={roster.length}
        ended={ended || showPodium}
        activityIndex={idx}
        activityCount={activities.length}
        timerSlot={
          timer && current && timer.activityId === current.id ? (
            <LiveTimer prominent deadline={timer.deadline} onExpire={handleInstructorExpire} onWarn={sound.onWarn} />
          ) : undefined
        }
        onClose={() => {
          // Guard against an accidental close abandoning a live presentation.
          if (ended || showPodium || window.confirm(t('live.instructor.leaveConfirm')))
            navigate('/live/instructor');
        }}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* The activity stays CENTERED in the space left of the sidebar —
            learner-identical stage, just centered rather than in a fixed grid. */}
        <main className="flex-1 lg:overflow-y-auto px-4 md:px-8 pb-8 flex flex-col">
          {/* Same SHARED kind→width rule as the learner surface — the professor
              projects the very same snack, so a `code` activity was equally
              squeezed here. Only the WIDTH token comes from the rule; the
              vertical rhythm stays keyed on sandbox exactly as before. */}
          <div
            data-testid="instructor-main"
            className={`w-full mx-auto ${columnMaxWidthClass(current?.kind, LIVE_COLUMN_OVERRIDES)} ${
              current?.kind === 'sandbox_scenario' ? 'py-6' : 'my-auto py-10'
            }`}
          >
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

            {onPodium ? (
              <div className="mt-8" data-testid="instructor-podium">
                <LivePodium ranking={podiumRanking} />
                <button
                  onClick={handleLeavePodium}
                  className="mt-8 mx-auto block h-12 px-8 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
                >
                  {t('live.ended.cta')}
                </button>
              </div>
            ) : stagedAnswer ? (
              // B9: pulling a learner REPLACES the professor's own screen with
              // theirs (no more two-screen split) — centered, with a "você está
              // visualizando a tela de ___" indicator in the identity bar.
              <div
                className="mt-7 rounded-3xl border border-clay/40 overflow-hidden"
                data-testid="instructor-viewing-stage"
              >
                <LiveStage
                  staged={stagedAnswer}
                  onClear={clearStage}
                  viewingName={stagedAnswer.author.name}
                />
              </div>
            ) : current ? (
              // The professor's own stage is INTERACTIVE — they can work the
              // activity live on the projector (type in the code snack, click a
              // choice to demonstrate). It only freezes into a static mirror once
              // the answer is revealed, so the shown solution can't be fiddled.
              // sandbox_scenario is facilitator-driven and never reveals, so it
              // stays interactive throughout.
              <LiveActivityStage
                activity={current}
                readOnly={current.kind !== 'sandbox_scenario' && revealCurrent}
                reveal={revealCurrent}
                testid="instructor-activity-stage"
                footer={
                  current.kind === 'sandbox_scenario' ? (
                    <p
                      className="mt-4 text-center text-sm text-muted-foreground"
                      data-testid="instructor-mirror-hint"
                    >
                      {t('live.instructor.mirrorHint')}
                    </p>
                  ) : undefined
                }
              />
            ) : lessonLoading ? (
              // Pointer set, lesson content still resolving (refresh mid-class) —
              // the SAME skeleton the learners get, never the lobby.
              <div className="mt-7 space-y-4" data-testid="live-activity-skeleton" aria-busy="true">
                <div className="h-6 w-2/3 rounded-lg ds-shimmer" />
                <div className="h-40 rounded-2xl ds-shimmer" />
                <div className="h-12 rounded-full ds-shimmer" />
              </div>
            ) : (
              // Reception — the SAME lobby the learners wait in before start.
              <LiveReception roster={roster} />
            )}
          </div>
        </main>

        <LiveSidebar
          role="instructor"
          hasActivity={Boolean(current)}
          activityIndex={idx}
          activityCount={activities.length}
          kind={current?.kind ?? ''}
          roster={roster}
          answerers={answerers}
          ranking={liveRanking}
          disconnectedUserIds={disconnectedUserIds}
          selfUserId={instructorId ?? undefined}
          copied={copied}
          busy={busy}
          onCopyLink={copyJoinLink}
          onEnd={handleEnd}
          controls={
            <>
              <InstructorControls
                inReception={inReception}
                answeredCount={answeredCount}
                presentCount={presentCount}
                busy={busy}
                canPrev={canPrev}
                canNext={canNext}
                timerRunning={timerActive}
                revealed={revealCurrent}
                // NOT `isAnswerableLiveKind`: a `code` round is answerable (it
                // gets a 5-min countdown) but has NO answer to put on screen, so
                // "Revelar resposta" must not appear there. The professor keeps
                // full control of the clock through the timer's own "Parar"
                // button below. See `hasRevealableAnswer`. A BYOC round is the
                // opposite case — its kind may be `concept`, but the generated
                // tree carries a gabarito, so it DOES have an answer to reveal.
                canReveal={hasRevealableAnswer(current?.kind) || (!!current && isByocActivity(current))}
                // Base per-activity duration PLUS any seconds the professor
                // pre-added while stopped — the start button label reflects the
                // real launch duration (the "obvious in UI" part).
                timerSeconds={baseTimerSeconds > 0 ? extendedTimerSeconds(baseTimerSeconds, timerBonus) : 0}
                onBegin={() => activities[0] && goTo(activities[0].id)}
                onPrev={() => canPrev && goTo(activities[idx - 1].id)}
                onNext={() => canNext && goTo(activities[idx + 1].id)}
                onStartTimer={(s) => {
                  if (!current) return;
                  broadcastTimer(current.id, s);
                  setTimerBonus(0); // consumed by this launch
                }}
                onStopTimer={() => current && clearTimer(current.id)}
                onAddTime={handleAddTime}
                onReveal={() => current && clearTimer(current.id)}
              />
              {current && (
                <div className="p-4">
                  <button
                    type="button"
                    onClick={() => setStageOpen((o) => !o)}
                    data-testid="live-stage-open"
                    aria-expanded={stageOpen}
                    aria-controls="live-stage-inline"
                    className={`w-full inline-flex items-center justify-center gap-2 h-11 rounded-full border text-sm font-medium transition-colors ${
                      stageOpen
                        ? 'border-clay bg-clay/20 text-clay'
                        : 'border-clay/40 bg-clay/10 text-clay hover:bg-clay/20'
                    }`}
                  >
                    <MonitorUp className="w-4 h-4" /> {t('live.stage.open')}
                    <ChevronDown className={`w-4 h-4 transition-transform ${stageOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {/* A turma cheia não pode espremer o resto da sidebar: a lista
                      ganha altura máxima e rola sozinha. */}
                  {stageOpen && (
                    <div
                      id="live-stage-inline"
                      className="mt-2 max-h-[38vh] overflow-y-auto rounded-2xl border border-border bg-background"
                    >
                      <LiveStagePicker
                        learners={stageLearners}
                        staged={Boolean(stagedAnswer)}
                        pendingUserId={stagePendingUserId}
                        unreachableUserId={stageUnreachableUserId}
                        onPull={requestStage}
                        onClear={clearStage}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          }
        />
      </div>

      <LiveSoundDock />
    </div>
  );
}
