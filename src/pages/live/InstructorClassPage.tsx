/**
 * Professor surface INDEX (`/live/instructor`) — the open-classes index (plan
 * 20260723-itera-live-routed-session-and-index). Instructor-gated (RequireRole).
 *
 * This page NO LONGER renders a live session inline. It lists the tenant's OPEN
 * classes (live now + scheduled) and hosts the "start a class" form. Opening a
 * class routes to `/live/instructor/:sessionId` (InstructorSessionPage), which is
 * the deep-linkable, reloadable instructor view of that one session.
 *
 *   - "Ao vivo agora"  → the `live` sessions visible to the instructor (RLS,
 *     tenant-scoped). Each card: lesson + start time, "Abrir" (→ the session
 *     route) and "Encerrar" (status → ended).
 *   - "Iniciar uma aula" → the create/schedule form. Starting navigates to the
 *     new session's route; scheduling adds a pending row (below).
 *   - "Agendadas"      → the `pending` (scheduled) sessions. "Iniciar agora"
 *     flips one live and routes to it; "Encerrar" cancels it.
 *
 * A redirect from the session route (a class that already ended / isn't found)
 * lands here with a `liveNotice` in the router state → a dismissible banner.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Play,
  GraduationCap,
  Loader2,
  Presentation,
  CalendarClock,
  Radio,
  ArrowRight,
  Square,
  X,
} from 'lucide-react';
import { AppHeader } from '@/components/branded';
import { useI18n } from '@/i18n';
import { useMembership } from '@/hooks/useMembership';
import { instructorTenantId } from '@/services/membership.service';
import { useIteraIdentity } from '@/hooks/useIteraIdentity';
import { usePrograms, useProgram, useLessonContent } from '@/hooks';
import {
  useMySessions,
  useLiveClassEnabled,
  useEnabledTenantIds,
} from '@/hooks/useLiveClass';
import {
  startClassSession,
  scheduleClassSession,
  startScheduledClass,
  endClassSession,
  type ClassSession,
} from '@/services/liveClass.service';
import { formatScheduledAt } from '@/utils/formatScheduledAt';
import { InstructorReportsCard } from '@/components/live/InstructorReportsCard';

export default function InstructorClassPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
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

  // Redirected here from a session route pointing at an ended / missing class
  // (InstructorSessionPage guard, ADR / Q#3) — surface the reason once.
  const [notice, setNotice] = useState<'ended' | 'notFound' | null>(null);
  useEffect(() => {
    const n = (location.state as { liveNotice?: 'ended' | 'notFound' } | null)?.liveNotice;
    if (n) setNotice(n);
  }, [location.key, location.state]);

  // Open classes, newest first (Q#2 — started_at/created_at desc). Scope = whatever
  // the instructor's RLS lets them see for this tenant (class_sessions_select).
  const live = useMemo(
    () =>
      (sessions ?? [])
        .filter((s) => s.status === 'live')
        .sort((a, b) => (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt)),
    [sessions]
  );
  const scheduled = useMemo(
    () =>
      (sessions ?? [])
        .filter((s) => s.status === 'pending')
        .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '')),
    [sessions]
  );

  const [endingId, setEndingId] = useState<string | null>(null);
  async function handleEnd(id: string) {
    if (endingId) return;
    setEndingId(id);
    try {
      await endClassSession(id);
      await refetch();
    } finally {
      setEndingId(null);
    }
  }

  async function handleStartNow(session: ClassSession) {
    const liveSession = await startScheduledClass(session.id);
    navigate(`/live/instructor/${liveSession.id}`);
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

        {notice && (
          <div
            className="mb-6 flex items-start gap-3 rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 max-w-2xl"
            role="status"
            data-testid="instructor-notice"
            data-notice={notice}
          >
            <p className="flex-1 text-sm text-foreground">
              {notice === 'ended'
                ? t('live.instructor.index.notice.ended')
                : t('live.instructor.index.notice.notFound')}
            </p>
            <button
              onClick={() => setNotice(null)}
              aria-label={t('live.instructor.index.notice.dismiss')}
              data-testid="instructor-notice-dismiss"
              className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

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
          <>
            {/* Ao vivo agora — the open classes running right now. */}
            {live.length > 0 && (
              <section className="mb-8" data-testid="instructor-live-now">
                <SectionHeader
                  icon={<Radio className="w-4 h-4 text-clay" />}
                  title={t('live.instructor.index.liveNow.title')}
                  subtitle={t('live.instructor.index.liveNow.subtitle')}
                />
                <ul className="space-y-3" data-testid="instructor-live-list">
                  {live.map((s) => (
                    <LiveSessionCard
                      key={s.id}
                      session={s}
                      onOpen={() => navigate(`/live/instructor/${s.id}`)}
                      onEnd={() => handleEnd(s.id)}
                      ending={endingId === s.id}
                    />
                  ))}
                </ul>
              </section>
            )}

            <StartClass
              tenantId={tenantId}
              instructorId={identity.userId}
              onStarted={(session) => navigate(`/live/instructor/${session.id}`)}
              onScheduled={() => refetch()}
            />

            {/* Agendadas — pending classes set to start later (Q#1: separate,
                lighter section below "Ao vivo agora"). */}
            {scheduled.length > 0 && (
              <section className="mt-8" data-testid="instructor-scheduled">
                <SectionHeader
                  icon={<CalendarClock className="w-4 h-4 text-clay" />}
                  title={t('live.instructor.index.scheduled.title')}
                  subtitle={t('live.instructor.index.scheduled.subtitle')}
                />
                <ul className="space-y-3" data-testid="instructor-scheduled-list">
                  {scheduled.map((s) => (
                    <ScheduledSessionCard
                      key={s.id}
                      session={s}
                      onStartNow={() => handleStartNow(s)}
                      onEnd={() => handleEnd(s.id)}
                      ending={endingId === s.id}
                    />
                  ))}
                </ul>
              </section>
            )}

            <InstructorReportsCard sessions={sessions ?? []} />
          </>
        )}
      </main>
    </div>
  );
}

/* ── Open-class cards ───────────────────────────────────────────────────── */

function LiveSessionCard({
  session,
  onOpen,
  onEnd,
  ending,
}: {
  session: ClassSession;
  onOpen: () => void;
  onEnd: () => void;
  ending: boolean;
}) {
  const { t, tText, locale } = useI18n();
  const { data: lesson } = useLessonContent(session.lessonId);
  const title = tText(lesson?.title) || t('live.instructor.index.lessonFallback');
  const startedTime = formatStartTime(session.startedAt, locale);

  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5"
      data-testid="instructor-live-card"
    >
      <span className="inline-flex items-center gap-1.5 flex-shrink-0 rounded-full bg-clay/15 text-clay text-[11px] font-mono uppercase tracking-wider px-2.5 py-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-clay opacity-60 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-clay" />
        </span>
        {t('live.instructor.index.liveBadge')}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate" data-testid="instructor-live-card-title">
          {title}
        </p>
        {startedTime && (
          <p className="text-xs text-muted-foreground">
            {t('live.instructor.index.startedAt', { time: startedTime })}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onOpen}
          data-testid="instructor-live-card-open"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-clay text-white text-sm font-medium hover:bg-clay/90 transition-colors"
        >
          {t('live.instructor.index.open')}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onEnd}
          disabled={ending}
          data-testid="instructor-live-card-end"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
        >
          {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
          {ending ? t('live.instructor.index.ending') : t('live.instructor.index.end')}
        </button>
      </div>
    </li>
  );
}

function ScheduledSessionCard({
  session,
  onStartNow,
  onEnd,
  ending,
}: {
  session: ClassSession;
  onStartNow: () => void;
  onEnd: () => void;
  ending: boolean;
}) {
  const { t, tText, locale } = useI18n();
  const { data: lesson } = useLessonContent(session.lessonId);
  const title = tText(lesson?.title) || t('live.instructor.index.lessonFallback');
  const when = formatScheduledAt(session.scheduledAt, locale);

  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3.5"
      data-testid="instructor-scheduled-card"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        {when && (
          <p className="text-xs text-muted-foreground">
            {t('live.instructor.index.scheduledFor', { time: when })}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onStartNow}
          data-testid="instructor-scheduled-start"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-clay text-white text-sm font-medium hover:bg-clay/90 transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {t('live.instructor.index.startNow')}
        </button>
        <button
          onClick={onEnd}
          disabled={ending}
          data-testid="instructor-scheduled-end"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
        >
          {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
          {ending ? t('live.instructor.index.ending') : t('live.instructor.index.end')}
        </button>
      </div>
    </li>
  );
}

/* ── Start a class (onboarding) ─────────────────────────────────────────── */

function StartClass({
  tenantId,
  instructorId,
  onStarted,
  onScheduled,
}: {
  tenantId: string;
  instructorId: string | null;
  onStarted: (session: ClassSession) => void;
  onScheduled: () => void;
}) {
  const { t, tText } = useI18n();
  const { data: programs = [], isPending } = usePrograms();
  const [slug, setSlug] = useState<string>('');
  const [lessonId, setLessonId] = useState<string>('');
  const [scheduledAt, setScheduledAt] = useState<string>('');
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
      const session = await startClassSession({
        tenantId,
        lessonId,
        instructorId,
        scope: 'global',
      });
      onStarted(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('live.instructor.start.error'));
    } finally {
      setStarting(false);
    }
  }

  async function handleSchedule() {
    if (!lessonId || !instructorId || !firstActivityId || !scheduledAt) return;
    setStarting(true);
    setError(null);
    try {
      await scheduleClassSession({
        tenantId,
        lessonId,
        instructorId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        scope: 'global',
      });
      setScheduledAt('');
      onScheduled();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('live.instructor.start.error'));
    } finally {
      setStarting(false);
    }
  }

  const canSchedule = Boolean(lessonId && instructorId && firstActivityId && scheduledAt) && !starting;

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

      <div className="flex flex-wrap items-center gap-3">
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

      {/* Schedule for later — same lesson selection, but sets a future start time
          instead of going live now. The pending row then shows under "Agendadas". */}
      <div className="mt-6 pt-6 border-t border-border">
        <label className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground mb-1.5">
          <CalendarClock className="w-4 h-4 text-clay" />
          {t('live.instructor.schedule.label')}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            data-testid="instructor-schedule-input"
            className="h-11 px-3 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-none focus:border-clay/60"
          />
          <button
            onClick={handleSchedule}
            disabled={!canSchedule}
            data-testid="instructor-schedule-btn"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-clay/50 text-sm font-medium text-clay hover:bg-clay/10 transition-colors disabled:opacity-50"
          >
            <CalendarClock className="w-4 h-4" />
            {t('live.instructor.schedule.cta')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── tiny presentational helpers ────────────────────────────────────────── */

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-display text-foreground">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  );
}

/**
 * Time-of-day for a live session's start. Same short HH:MM the reports card uses,
 * localized. Returns '' for a missing/invalid timestamp so the caller can hide it.
 */
function formatStartTime(iso: string | null | undefined, locale: 'pt' | 'en'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(locale === 'pt' ? 'pt-BR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
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
