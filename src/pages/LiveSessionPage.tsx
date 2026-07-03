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
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { X, Heart, Radio, Loader2 } from 'lucide-react';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { useLessonContent } from '@/hooks';
import { useClassSession } from '@/hooks/useClassSession';
import { useIteraIdentity } from '@/hooks/useIteraIdentity';
import { useI18n } from '@/i18n';
import { persistActivityProgress } from '@/services/progress.service';
import type { Activity } from '@/types/content';

const DECORATIVE_HEARTS = 5;

export default function LiveSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { t, tText } = useI18n();

  const identity = useIteraIdentity();
  const { session, currentActivityId, status, roster, connected, loading } = useClassSession(
    sessionId,
    identity.userId
      ? { userId: identity.userId, name: identity.name, isInstructor: false }
      : undefined
  );

  const { data: lesson } = useLessonContent(session?.lessonId);
  const lessonLoaded = Boolean(lesson);
  const activities = useMemo<Activity[]>(() => lesson?.activities ?? [], [lesson]);

  const current = useMemo(
    () => activities.find((a) => a.id === currentActivityId) ?? null,
    [activities, currentActivityId]
  );

  // Per-activity local "done" flag (result writes stay per-user). Reset whenever
  // the professor force-advances to a different activity.
  const [doneId, setDoneId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDoneId(null);
    setSaving(false);
  }, [currentActivityId]);

  async function handleComplete(correct: boolean) {
    if (!current || saving) return;
    // Force-advance model: completing does NOT move the student forward — the
    // professor's pointer is the only thing that advances. We just persist the
    // per-user result and mark this activity done locally.
    if (correct) {
      setSaving(true);
      await persistActivityProgress(current.id);
      setSaving(false);
      setDoneId(current.id);
    }
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
      {/* Immersive chrome — same as the solo player, plus a LIVE indicator. */}
      <header className="relative">
        <div
          className="h-1 w-full bg-muted"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          data-testid="live-progress"
        >
          <div
            className="h-full bg-clay transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
            data-testid="live-progress-fill"
          />
        </div>

        <button
          onClick={() => navigate('/')}
          aria-label={t('common.back')}
          data-testid="live-close"
          className="absolute top-2.5 left-3 md:left-4 w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* LIVE pill + presence count (center-ish, top). Once the session ends
            the pill flips to a muted "Encerrada" — no live styling, no pulsing
            dot, no presence count (loop-2 fix #7). */}
        <div
          className="absolute top-2.5 left-1/2 -translate-x-1/2 h-9 flex items-center gap-2"
          data-testid="live-indicator"
          data-status={ended ? 'ended' : 'live'}
        >
          {ended ? (
            <span
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full border border-border bg-card text-xs font-medium text-muted-foreground"
              data-testid="live-indicator-ended"
            >
              <span className="inline-flex h-2 w-2 rounded-full bg-muted-foreground" aria-hidden="true" />
              {t('live.status.ended')}
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-xs font-medium ${
                connected
                  ? 'border-clay/50 bg-clay/10 text-clay'
                  : 'border-border bg-card text-muted-foreground'
              }`}
            >
              <span className="relative flex h-2 w-2" aria-hidden="true">
                {connected && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clay opacity-75" />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-clay' : 'bg-muted-foreground'}`} />
              </span>
              {t('live.badge.label')}
              <span className="opacity-70">· {roster.length}</span>
            </span>
          )}
        </div>

        <div
          className="absolute top-2.5 right-3 md:right-4 h-9 flex items-center gap-1.5 text-foreground"
          data-testid="live-hearts"
          aria-hidden="true"
        >
          <Heart className="w-4 h-4 fill-clay text-clay" />
          <span className="font-mono text-sm tabular-nums">{DECORATIVE_HEARTS}</span>
        </div>
      </header>

      <main className="flex-1 w-full mx-auto max-w-2xl px-4 md:px-6 pt-14 md:pt-20">
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
            className="rounded-3xl border border-border bg-card p-10 text-center"
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

            {current ? null : !lessonLoaded ? (
              // Late-join / reconnect: the durable session may ALREADY carry a
              // live pointer, but the lesson content hasn't resolved yet. Show an
              // activity SKELETON (not the "waiting" state) so a joiner with a
              // live pointer goes straight to the activity once it lands — no
              // false "Aguardando o professor…" flash. (loop-1 fix #3.)
              <div className="mt-7 space-y-4" data-testid="live-activity-skeleton" aria-busy="true">
                <div className="h-6 w-2/3 rounded-lg ds-shimmer" />
                <div className="h-40 rounded-2xl ds-shimmer" />
                <div className="h-12 rounded-full ds-shimmer" />
              </div>
            ) : !currentActivityId ? (
              // Lesson is loaded and there's genuinely NO pointer — the professor
              // hasn't pointed at an activity yet. Hold on a calm "waiting" state.
              <div
                className="mt-8 rounded-3xl border border-dashed border-clay/40 bg-clay/5 p-12 text-center"
                data-testid="live-waiting"
              >
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-clay" />
                <p className="font-display text-lg text-foreground mt-4">{t('live.waiting.title')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('live.waiting.subtitle')}</p>
              </div>
            ) : (
              // Lesson loaded, pointer set, but the activity isn't in the list
              // (transient pointer/lesson mismatch) — skeleton rather than a
              // misleading "waiting" state.
              <div className="mt-7 space-y-4" data-testid="live-activity-skeleton" aria-busy="true">
                <div className="h-6 w-2/3 rounded-lg ds-shimmer" />
                <div className="h-40 rounded-2xl ds-shimmer" />
                <div className="h-12 rounded-full ds-shimmer" />
              </div>
            )}
            {current && (
              <div className="mt-7">
                {/* key on the activity id so a force-advance fully remounts the
                    renderer (fresh state) — the student loses the prior activity. */}
                <ActivityRenderer
                  key={current.id}
                  activity={{ ...current, status: doneId === current.id ? 'done' : current.status }}
                  onComplete={handleComplete}
                />
                {doneId === current.id && (
                  <p
                    className="mt-5 text-center text-sm text-menta"
                    data-testid="live-done-hint"
                  >
                    {t('live.done.waitForNext')}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
