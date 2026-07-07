/**
 * Professor control surface (`/live/instructor`) — the INSTRUCTOR side of the
 * real-time cohort mode (plan 20260702-…). Instructor-gated (RequireRole).
 *
 * The batch professor runs the class from here, so it ships real onboarding /
 * empty-states — not a dev-only minimal surface:
 *   - No live class yet   → "Start a class": pick a program → lesson → Start.
 *   - Live class running  → the CONTROL panel: the current activity + prev/next
 *     pointer, End, a live presence roster, and a "who's done on the current
 *     activity" view (reuses the admin-style completion query).
 *
 * The instructor advances the server-authoritative pointer (durable
 * advanceClassSession) AND broadcasts it (fast path) so every student jumps.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Radio,
  Play,
  ChevronLeft,
  ChevronRight,
  Square,
  Users,
  CheckCircle2,
  XCircle,
  Circle,
  GraduationCap,
  Loader2,
  Presentation,
  Link2,
  Check,
} from 'lucide-react';
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
import { LiveTimer } from '@/components/live/LiveTimer';
import { LiveTimerControls } from '@/components/live/LiveTimerControls';
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
        ) : liveSession ? (
          <ClassControl
            session={liveSession}
            tenantId={tenantId}
            instructorId={identity.userId}
            instructorName={identity.name}
            onEnded={() => refetch()}
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
          {programs.map((p) => (
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

  const { currentActivityId, roster, connected, answers, timer, broadcast, broadcastTimer, clearTimer, refetch } =
    useClassSession(
      session.id,
      instructorId ? { userId: instructorId, name: instructorName, isInstructor: true } : undefined
    );
  const { data: lesson } = useLessonContent(session.lessonId);
  const activities = useMemo<Activity[]>(() => lesson?.activities ?? [], [lesson]);

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
    () => mergeLiveAnswers(polled, currentActivityId ? answers[currentActivityId] : undefined),
    [polled, answers, currentActivityId]
  );
  const doneCount = answerers.filter((a) => a.state === 'done').length;

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
  const startAt = idx < 0 && activities.length > 0; // pointer not set yet

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

  return (
    <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6" data-testid="instructor-control">
      {/* LEFT — the stage */}
      <div className="rounded-3xl border border-clay/40 bg-card p-6 md:p-8">
        <div className="flex items-center justify-between gap-3 mb-5">
          <span
            className={`inline-flex items-center gap-2 px-3 h-8 rounded-full border text-xs font-medium ${
              connected ? 'border-clay/50 bg-clay/10 text-clay' : 'border-border bg-background text-muted-foreground'
            }`}
            data-testid="instructor-live-pill"
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clay opacity-75" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-clay' : 'bg-muted-foreground'}`} />
            </span>
            {t('live.badge.label')}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {tText(lesson?.title)}
          </span>
        </div>

        {startAt ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">{t('live.instructor.control.notStarted')}</p>
            <button
              onClick={() => goTo(activities[0].id)}
              disabled={busy}
              data-testid="instructor-begin-btn"
              className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-clay text-white font-medium hover:bg-clay/90 transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" /> {t('live.instructor.control.begin')}
            </button>
          </div>
        ) : (
          <>
            <div className="text-[11px] uppercase tracking-wider text-clay font-mono">
              {t('live.instructor.control.activity')} {idx + 1}/{activities.length}
            </div>
            <div
              className="mt-2 rounded-2xl border border-border bg-background p-5"
              data-testid="instructor-current-activity"
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-mono">
                {current?.kind}
              </div>
              <p className="text-foreground mt-1.5 font-medium">
                {activityLabel(current, tText) || t('live.instructor.control.untitled')}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <LiveTimerControls
                running={Boolean(timer && current && timer.activityId === current.id)}
                onStart={(s) => current && broadcastTimer(current.id, s)}
                onStop={() => current && clearTimer(current.id)}
              />
              {timer && current && timer.activityId === current.id && (
                <LiveTimer deadline={timer.deadline} />
              )}
            </div>

            {/* Pointer controls */}
            <div className="flex items-center gap-2.5 mt-6">
              <button
                onClick={() => canPrev && goTo(activities[idx - 1].id)}
                disabled={!canPrev || busy}
                data-testid="instructor-prev"
                className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-clay/50 transition-colors disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" /> {t('live.instructor.control.prev')}
              </button>
              <button
                onClick={() => canNext && goTo(activities[idx + 1].id)}
                disabled={!canNext || busy}
                data-testid="instructor-next"
                className="inline-flex items-center gap-1.5 h-11 px-5 rounded-full bg-clay text-white text-sm font-medium hover:bg-clay/90 transition-colors disabled:opacity-40"
              >
                {t('live.instructor.control.next')} <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleEnd}
                disabled={busy}
                data-testid="instructor-end"
                className="ml-auto inline-flex items-center gap-1.5 h-11 px-4 rounded-full border border-destructive/40 bg-destructive/10 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5" /> {t('live.instructor.control.end')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* RIGHT — presence + who's done */}
      <div className="space-y-5">
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-menta" />
            <h3 className="font-display text-foreground text-sm">
              {t('live.instructor.roster.inRoom')}
            </h3>
            <span className="ml-auto font-mono text-sm tabular-nums text-menta" data-testid="instructor-presence-count">
              {roster.length}
            </span>
          </div>
          {roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('live.instructor.roster.empty')}</p>
          ) : (
            <ul className="space-y-1.5" data-testid="instructor-presence-list">
              {roster.map((m) => (
                <li key={m.userId} className="flex items-center gap-2 text-sm text-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-menta" />
                  {m.name}
                  {m.isInstructor && (
                    <span className="text-[10px] uppercase tracking-wide text-clay font-mono">
                      · {t('live.instructor.roster.you')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="w-4 h-4 text-clay" />
            <h3 className="font-display text-foreground text-sm">
              {t('live.instructor.done.title')}
            </h3>
            <span className="ml-auto font-mono text-sm tabular-nums text-clay" data-testid="instructor-done-count">
              {doneCount}/{answerers.length}
            </span>
          </div>
          {answerers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('live.instructor.done.empty')}</p>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto" data-testid="instructor-done-list">
              {answerers.map((a) => (
                <li key={a.userId} className="flex items-center gap-2 text-sm" data-state={a.state}>
                  {a.state === 'done' ? (
                    <CheckCircle2 className="w-4 h-4 text-menta flex-shrink-0" />
                  ) : a.state === 'wrong' ? (
                    <XCircle className="w-4 h-4 text-clay flex-shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className={a.state === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>
                    {a.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={copyJoinLink}
          data-testid="instructor-copy-link"
          className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-menta/50 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-menta" /> {t('live.instructor.copyLinkDone')}
            </>
          ) : (
            <>
              <Link2 className="w-4 h-4" /> {t('live.instructor.copyLink')}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ── tiny presentational helpers ────────────────────────────────────────── */

function activityLabel(
  activity: Activity | null,
  tText: (bag: Record<string, string | undefined> | null | undefined) => string
): string {
  if (!activity) return '';
  const spec = activity.spec as Record<string, unknown>;
  const prompt = typeof spec.prompt === 'string' ? spec.prompt : '';
  const question = typeof spec.question === 'string' ? spec.question : '';
  const titleBag =
    spec.title && typeof spec.title === 'object'
      ? (spec.title as Record<string, string | undefined>)
      : null;
  return prompt || question || (titleBag ? tText(titleBag) : '');
}

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
