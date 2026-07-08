/**
 * Professor control surface (`/live/instructor`) — the INSTRUCTOR side of the
 * real-time cohort mode (plan 20260702-…). Instructor-gated (RequireRole).
 *
 *   - No live class yet   → the onboarding dashboard: pick a program → lesson
 *     → Start (AppHeader + hero shell).
 *   - Live class running  → the FULL-SCREEN immersive surface: the exact chrome
 *     + activity stage the learners see (LiveSessionChrome + LiveActivityStage,
 *     read-only), a live roster / who's-done / speed-ranking aside, and a fixed
 *     presenter control bar. On screen-share the cohort sees the same thing,
 *     minus the bar — the parity the TL asked for.
 *
 * The instructor advances the server-authoritative pointer (durable
 * advanceClassSession) AND broadcasts it (fast path) so every student jumps.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Play, GraduationCap, Loader2, Presentation } from 'lucide-react';
import { AppHeader } from '@/components/branded';
import { useI18n } from '@/i18n';
import { useMembership } from '@/hooks/useMembership';
import { instructorTenantId } from '@/services/membership.service';
import { useIteraIdentity } from '@/hooks/useIteraIdentity';
import { usePrograms, useProgram, useLessonContent } from '@/hooks';
import {
  useMySessions,
  useClassCompleters,
  useLiveClassEnabled,
  useEnabledTenantIds,
} from '@/hooks/useLiveClass';
import { useClassSession } from '@/hooks/useClassSession';
import { queryKeys } from '@/lib/queryKeys';
import {
  startClassSession,
  advanceClassSession,
  endClassSession,
  type ClassSession,
} from '@/services/liveClass.service';
import { mergeLiveAnswers } from '@/utils/mergeLiveAnswers';
import { rankByTiming } from '@/utils/rankByTiming';
import { LiveTimer } from '@/components/live/LiveTimer';
import { LiveReception } from '@/components/live/LiveReception';
import { LiveSessionChrome } from '@/components/live/LiveSessionChrome';
import { LiveActivityStage } from '@/components/live/LiveActivityStage';
import { InstructorControlBar } from '@/components/live/InstructorControlBar';
import { InstructorSidebar } from '@/components/live/InstructorSidebar';
import { useLiveSound } from '@/hooks/useLiveSound';
import type { Activity } from '@/types/content';

export default function InstructorClassPage() {
  const { t } = useI18n();
  const { data: memberships } = useMembership();
  const { data: enabledTenantIds } = useEnabledTenantIds();
  // Deterministic instructor tenant: prefer a live-class-enabled tenant (dfl-batch)
  // over the PLG-auto-created personal `owner` tenant. (loop-1 fix #4.)
  const tenantId = instructorTenantId(memberships ?? [], {
    enabledTenantIds: enabledTenantIds ?? [],
  });
  const identity = useIteraIdentity();
  const { data: enabled, isPending: enabledPending } = useLiveClassEnabled();
  const { data: sessions, isPending, refetch } = useMySessions(tenantId);

  const liveSession = useMemo(
    () => (sessions ?? []).find((s) => s.status === 'live') ?? null,
    [sessions]
  );

  // A running class takes over the full screen — the immersive learner surface
  // plus the presenter controls. The dashboard shell (AppHeader + hero) is only
  // the pre-start onboarding (pick a program → start).
  if (liveSession && tenantId) {
    return (
      <ClassControl
        session={liveSession}
        tenantId={tenantId}
        instructorId={identity.userId}
        instructorName={identity.name}
        onEnded={() => refetch()}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader active="discover" />
      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Hero */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-clay/10 border border-clay/40 flex items-center justify-center text-clay">
            <Presentation className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[13px] uppercase tracking-wider text-clay font-mono">
              {t('live.instructor.kicker')}
            </span>
            <h1 className="font-display font-bold text-foreground leading-tight" data-testid="instructor-title">
              {t('live.instructor.title')}
            </h1>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
          {t('live.instructor.subtitle')}
        </p>

        {enabledPending || (isPending && tenantId) ? (
          <Centered>
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </Centered>
        ) : !tenantId ? (
          <EmptyState
            testid="instructor-no-tenant"
            title={t('live.instructor.noTenant.title')}
            subtitle={t('live.instructor.noTenant.subtitle')}
          />
        ) : enabled === false ? (
          <EmptyState
            testid="instructor-disabled"
            title={t('live.instructor.disabled.title')}
            subtitle={t('live.instructor.disabled.subtitle')}
          />
        ) : (
          <StartClass
            tenantId={tenantId}
            instructorId={identity.userId}
            onStarted={() => refetch()}
          />
        )}
      </main>
    </div>
  );
}

/* ── Start a class (onboarding) ─────────────────────────────────────────── */

function StartClass({
  tenantId,
  instructorId,
  onStarted,
}: {
  tenantId: string;
  instructorId: string | null;
  onStarted: () => void;
}) {
  const { t, tText } = useI18n();
  const { data: programs = [], isPending } = usePrograms();
  const [slug, setSlug] = useState<string>('');
  const [lessonId, setLessonId] = useState<string>('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: program } = useProgram(slug || undefined);
  const { data: lesson, isFetching: lessonFetching } = useLessonContent(lessonId || undefined);

  // Only programs of the teaching tenant — starting a class on another tenant's
  // catalog program would leave its learners with an empty (RLS-blocked) activity
  // (black screen), since they can't read cross-tenant content.
  const tenantPrograms = useMemo(
    () => programs.filter((p) => p.tenantId === tenantId),
    [programs, tenantId]
  );

  const lessons = useMemo(
    () =>
      (program?.units ?? [])
        .flatMap((u) => (u.lessons ?? []).map((l) => ({ id: l.id, title: l.title })))
        .filter((l) => l.id),
    [program]
  );

  // The lesson's first activity — resolved once useLessonContent lands. We GUARD
  // Start on this being non-null so a professor can't start a class on a lesson
  // with no activities. Since sessions open in reception (null pointer), this
  // client-side guard is now the ONLY check that the lesson has content to run.
  const firstActivityId = (lesson?.activities ?? [])[0]?.id ?? null;
  const lessonActivitiesLoading = Boolean(lessonId) && !firstActivityId && lessonFetching;
  const lessonHasNoActivities =
    Boolean(lessonId) && !lessonFetching && (lesson?.activities?.length ?? 0) === 0;
  const canStart = Boolean(lessonId && instructorId && firstActivityId) && !starting;

  async function handleStart() {
    if (!lessonId || !instructorId || !firstActivityId) return;
    setStarting(true);
    setError(null);
    try {
      await startClassSession({
        tenantId,
        lessonId,
        instructorId,
        scope: 'global',
      });
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('live.instructor.start.error'));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-6 md:p-8 max-w-2xl" data-testid="instructor-start">
      <div className="flex items-center gap-2.5 mb-1.5">
        <GraduationCap className="w-5 h-5 text-clay" />
        <h2 className="font-display text-foreground">{t('live.instructor.start.title')}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{t('live.instructor.start.subtitle')}</p>

      {/* Step 1 — program */}
      <label className="block text-[13px] font-medium text-muted-foreground mb-1.5">
        {t('live.instructor.start.program')}
      </label>
      {isPending ? (
        <div className="h-11 rounded-xl ds-shimmer mb-5" />
      ) : (
        <select
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setLessonId('');
          }}
          data-testid="instructor-program-select"
          className="w-full h-11 px-3 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-none focus:border-clay/60 mb-5"
        >
          <option value="">{t('live.instructor.start.programPlaceholder')}</option>
          {tenantPrograms.map((p) => (
            <option key={p.id} value={p.slug}>
              {tText(p.title)}
            </option>
          ))}
        </select>
      )}

      {/* Step 2 — lesson */}
      <label className="block text-[13px] font-medium text-muted-foreground mb-1.5">
        {t('live.instructor.start.lesson')}
      </label>
      <select
        value={lessonId}
        onChange={(e) => setLessonId(e.target.value)}
        disabled={!slug || lessons.length === 0}
        data-testid="instructor-lesson-select"
        className="w-full h-11 px-3 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-none focus:border-clay/60 disabled:opacity-50 mb-6"
      >
        <option value="">
          {slug ? t('live.instructor.start.lessonPlaceholder') : t('live.instructor.start.pickProgramFirst')}
        </option>
        {lessons.map((l) => (
          <option key={l.id} value={l.id}>
            {tText(l.title)}
          </option>
        ))}
      </select>

      {error && (
        <p className="text-sm text-destructive mb-4" data-testid="instructor-start-error" role="alert">
          {error}
        </p>
      )}

      {lessonActivitiesLoading && (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground mb-4"
          data-testid="instructor-start-loading-activities"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t('live.instructor.start.loadingActivities')}
        </p>
      )}
      {lessonHasNoActivities && (
        <p
          className="text-sm text-destructive mb-4"
          data-testid="instructor-start-no-activities"
          role="alert"
        >
          {t('live.instructor.start.noActivities')}
        </p>
      )}

      <button
        onClick={handleStart}
        disabled={!canStart}
        data-testid="instructor-start-btn"
        className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-clay text-white font-medium hover:bg-clay/90 transition-colors disabled:opacity-50"
      >
        {starting || lessonActivitiesLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        {t('live.instructor.start.cta')}
      </button>
    </div>
  );
}

/* ── Live control panel ─────────────────────────────────────────────────── */

function ClassControl({
  session,
  tenantId,
  instructorId,
  instructorName,
  onEnded,
}: {
  session: ClassSession;
  tenantId: string;
  instructorId: string | null;
  instructorName: string;
  onEnded: () => void;
}) {
  const { t, tText } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { currentActivityId, status, roster, connected, answers, elapsed, timer, broadcast, broadcastTimer, clearTimer, refetch } =
    useClassSession(
      session.id,
      instructorId ? { userId: instructorId, name: instructorName, isInstructor: true } : undefined
    );
  const sound = useLiveSound();
  const { data: lesson, isPending: lessonPending } = useLessonContent(session.lessonId);
  const activities = useMemo<Activity[]>(() => lesson?.activities ?? [], [lesson]);

  // If the session ends out-of-band (another tab/device), leave the live
  // surface — never strand the professor in a "LIVE" chrome whose controls
  // silently no-op. onEnded() refetches → falls back to the onboarding dashboard.
  useEffect(() => {
    if (status === 'ended') onEnded();
  }, [status, onEnded]);

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
  const answerers = useMemo(
    () =>
      mergeLiveAnswers(
        polled,
        currentActivityId ? answers[currentActivityId] : undefined,
        currentActivityId ? elapsed[currentActivityId] : undefined
      ),
    [polled, answers, elapsed, currentActivityId]
  );

  // Class-wide speed leaderboard of the present learners (cumulative across every
  // activity answered so far), so by the end of the class it's the final ranking.
  const ranking = useMemo(() => rankByTiming(roster, elapsed, answers), [roster, elapsed, answers]);

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.liveClass.mySessions(tenantId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.liveClass.active });
      onEnded();
    } finally {
      setBusy(false);
    }
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
      <LiveSessionChrome
        progressPct={progressPct}
        connected={connected}
        presenceCount={roster.length}
        ended={ended}
        onClose={() => {
          // Guard against an accidental close abandoning a live presentation.
          if (ended || window.confirm(t('live.instructor.leaveConfirm'))) navigate('/');
        }}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* The activity stays CENTERED in the space left of the sidebar —
            learner-identical stage, just centered rather than in a fixed grid. */}
        <main className="flex-1 lg:overflow-y-auto px-4 md:px-8 pt-14 md:pt-20 pb-44 lg:pb-28">
          <div className="max-w-2xl mx-auto">
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

            {current ? (
              <LiveActivityStage
                activity={current}
                readOnly
                testid="instructor-activity-stage"
                timerSlot={
                  timer && timer.activityId === current.id ? (
                    <LiveTimer deadline={timer.deadline} onExpire={sound.onTimeUp} onWarn={sound.onWarn} />
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

        <InstructorSidebar
          hasActivity={Boolean(current)}
          activityIndex={idx}
          activityCount={activities.length}
          kind={current?.kind ?? ''}
          roster={roster}
          answerers={answerers}
          ranking={ranking}
          selfUserId={instructorId ?? undefined}
          copied={copied}
          busy={busy}
          onCopyLink={copyJoinLink}
          onEnd={handleEnd}
        />
      </div>

      <InstructorControlBar
        inReception={inReception}
        activityIndex={idx}
        activityCount={activities.length}
        answeredCount={answeredCount}
        presentCount={presentCount}
        busy={busy}
        canPrev={canPrev}
        canNext={canNext}
        timerRunning={Boolean(timer && current && timer.activityId === current.id)}
        onBegin={() => activities[0] && goTo(activities[0].id)}
        onPrev={() => canPrev && goTo(activities[idx - 1].id)}
        onNext={() => canNext && goTo(activities[idx + 1].id)}
        onStartTimer={(s) => current && broadcastTimer(current.id, s)}
        onStopTimer={() => current && clearTimer(current.id)}
      />
    </div>
  );
}

/* ── tiny presentational helpers ────────────────────────────────────────── */

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center py-20">{children}</div>;
}

function EmptyState({
  title,
  subtitle,
  testid,
}: {
  title: string;
  subtitle: string;
  testid: string;
}) {
  return (
    <div
      className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center max-w-2xl"
      data-testid={testid}
    >
      <p className="font-display text-lg text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>
    </div>
  );
}
