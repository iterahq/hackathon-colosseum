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
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { buildLiveRoomRows } from '@/utils/liveRoomRows';
import {
  ensureSessionGuestCode,
  getSessionGuestCode,
  listSessionGuestUserIds,
} from '@/services/guestLink.service';
import { guestLinkFor } from '@/guest/guestRoute';
import { LivePodium } from '@/components/live/LivePodium';
import { LiveTimer } from '@/components/live/LiveTimer';
import { LiveReception } from '@/components/live/LiveReception';
import { LiveSessionChrome } from '@/components/live/LiveSessionChrome';
import { LiveSoundDock } from '@/components/live/LiveSoundDock';
import { LiveActivityStage } from '@/components/live/LiveActivityStage';
import { LiveStage } from '@/components/live/LiveStage';
import { ActivitySkeleton } from '@/components/branded/activity/ActivitySkeleton';
import { InstructorControls } from '@/components/live/InstructorControls';
import { LiveSidebar } from '@/components/live/LiveSidebar';
import { LiveReconnectBanner } from '@/components/live/LiveReconnectBanner';
import { useLiveSound } from '@/hooks/useLiveSound';
import type { Activity } from '@/types/content';
import type { ClassPresenceMember } from '@/types/liveClass';

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
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { currentActivityId, status, roster, connected, reconnecting, answers, elapsed, timer, stoppedFor, stagedAnswer, stagePendingUserId, stageUnreachableUserId, stars, awardStar, lowerHand, removeLearner, broadcast, broadcastTimer, clearTimer, requestStage, clearStage, refetch } =
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
    stars: typeof stars;
  } | null>(null);
  // Live ranking for the sidebar. Merges the CURRENT roster in directly (not
  // just the ref) so a fresh joiner appears immediately — the ref-updating
  // effect runs after render, and the ref alone isn't a memo dependency.
  const liveRanking = useMemo(
    () =>
      rankByScore(
        [...mergeSeenLearners(seenLearnersRef.current, roster).values()],
        elapsed,
        answers,
        stars
      ),
    [roster, elapsed, answers, stars]
  );
  const podiumRanking = useMemo(() => {
    if (!podiumSnapshot) return liveRanking;
    return rankByScore(
      podiumSnapshot.roster,
      podiumSnapshot.elapsed,
      podiumSnapshot.answers,
      podiumSnapshot.stars
    );
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
        stars,
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

  // ── Guest link (plan 20260728-…, ADR-12) ────────────────────────────────
  // Sibling of copyJoinLink for an audience with NO account: copies
  // `${origin}/g/${guest_code}`, minting the session's short code on first use
  // (an UPDATE gated by the existing class_sessions_update_staff policy).
  // Capability-probed: `guest_code` / `class_guests` arrive in migration 0026 and
  // the Itera project has no migration ledger, so a deploy can legitimately ship
  // this UI before the DDL is applied. When the probe says "not available" the
  // button simply does not render — never a button that 400s.
  const [guestLinkAvailable, setGuestLinkAvailable] = useState(false);
  const [guestCopied, setGuestCopied] = useState(false);
  const [guestLinkBusy, setGuestLinkBusy] = useState(false);
  const [guestUserIds, setGuestUserIds] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void getSessionGuestCode(session.id).then((state) => {
      if (alive) setGuestLinkAvailable(state.available);
    });
    void listSessionGuestUserIds(session.id).then((ids) => {
      if (alive) setGuestUserIds(ids);
    });
    return () => {
      alive = false;
    };
    // Re-probe as people join: the roster changing is the cheapest signal that a
    // new guest may have registered (no cap in v1 → no other trigger to hook).
  }, [session.id, roster.length]);

  const stagedUserId = stagedAnswer?.author.userId ?? null;
  const toggleStage = useCallback(
    (userId: string) => (stagedUserId === userId ? clearStage() : requestStage(userId)),
    [stagedUserId, clearStage, requestStage]
  );

  // The professor puts THEMSELVES on the projector (instructor feedback
  // 2026-08-01: "seria tipo colocar eu mesmo no palco"). It rides the same pull
  // the learners get — the stage-request handler answers for whoever is
  // targeted, so there is no second protocol. What differs is only the
  // professor's OWN screen: it stays the interactive stage below, or they would
  // be mirroring a screen they can no longer type into.
  const selfStaged = Boolean(instructorId) && stagedUserId === instructorId;
  const toggleSelfStage = useCallback(
    () => void (instructorId && toggleStage(instructorId)),
    [instructorId, toggleStage]
  );
  const stageHint = selfStaged
    ? t('live.instructor.selfStagedHint')
    : current?.kind === 'sandbox_scenario'
      ? t('live.instructor.mirrorHint')
      : null;

  // A escrita pode ser recusada pela RLS (quem não é staff da aula) ou cair na
  // rede: sem o aviso, o professor acha que tirou o aluno e ele continua lá.
  const moderation = useMemo(
    () => ({
      onStar: (userId: string, delta: 1 | -1) =>
        void awardStar(userId, delta).then((ok) => ok || toast.error(t('live.room.action.failed'))),
      onLowerHand: lowerHand,
      onRemove: (userId: string) =>
        void removeLearner(userId).then((ok) => ok || toast.error(t('live.room.action.failed'))),
    }),
    [awardStar, lowerHand, removeLearner, t]
  );

  // The single sidebar list: podium order + this activity's state per row.
  const roomRows = useMemo(
    () =>
      buildLiveRoomRows({
        ranking: liveRanking,
        answerers,
        roster,
        currentActivityId,
        disconnectedUserIds,
        guestUserIds,
      }),
    [liveRanking, answerers, roster, currentActivityId, disconnectedUserIds, guestUserIds]
  );

  async function copyGuestLink() {
    setGuestLinkBusy(true);
    try {
      const { code } = await ensureSessionGuestCode(session.id);
      if (!code) return;
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      await navigator.clipboard?.writeText(guestLinkFor(origin, code));
      setGuestCopied(true);
      setTimeout(() => setGuestCopied(false), 2000);
    } catch {
      /* clipboard unavailable / RLS refused — no-op, the button stays idle */
    } finally {
      setGuestLinkBusy(false);
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
            {onPodium ? (
              <div className="mt-8" data-testid="instructor-podium">
                <LivePodium ranking={podiumRanking} guestUserIds={guestUserIds} />
                <button
                  onClick={handleLeavePodium}
                  className="mt-8 mx-auto block h-12 px-8 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
                >
                  {t('live.ended.cta')}
                </button>
              </div>
            ) : stagedAnswer && !selfStaged ? (
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
                  stageHint ? (
                    <p
                      className={`mt-4 text-center text-sm ${selfStaged ? 'text-evergreen-hi' : 'text-muted-foreground'}`}
                      data-testid={selfStaged ? 'instructor-self-staged-hint' : 'instructor-mirror-hint'}
                    >
                      {stageHint}
                    </p>
                  ) : undefined
                }
              />
            ) : lessonLoading ? (
              // Pointer set, lesson content still resolving (refresh mid-class) —
              // the SAME skeleton the learners get, never the lobby.
              <div className="mt-7">
                <ActivitySkeleton />
              </div>
            ) : (
              // Reception — the SAME lobby the learners wait in before start.
              <LiveReception roster={roster} guestUserIds={guestUserIds} />
            )}
          </div>
        </main>

        <LiveSidebar
          role="instructor"
          hasActivity={Boolean(current)}
          activityIndex={idx}
          activityCount={activities.length}
          roster={roster}
          answerers={answerers}
          rows={roomRows}
          stagedAuthor={stagedAnswer?.author ?? null}
          stagePendingUserId={stagePendingUserId}
          stageUnreachableUserId={stageUnreachableUserId}
          onToggleStage={toggleStage}
          moderation={moderation}
          copied={copied}
          busy={busy}
          onCopyLink={copyJoinLink}
          onCopyGuestLink={guestLinkAvailable ? copyGuestLink : undefined}
          guestCopied={guestCopied}
          guestLinkBusy={guestLinkBusy}
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
                selfStaged={selfStaged}
                onToggleSelfStage={toggleSelfStage}
              />
            </>
          }
        />
      </div>

      <LiveSoundDock />
    </div>
  );
}
