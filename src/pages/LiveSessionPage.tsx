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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { X, Heart, Radio, Loader2 } from 'lucide-react';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { LiveReception } from '@/components/live/LiveReception';
import { LiveTimer } from '@/components/live/LiveTimer';
import { LiveRosterCard } from '@/components/live/LiveRosterCard';
import { LiveAnswerersCard } from '@/components/live/LiveAnswerersCard';
import { LiveSoundToggle } from '@/components/live/LiveSoundToggle';
import { useLessonContent } from '@/hooks';
import { useClassSession } from '@/hooks/useClassSession';
import { useIteraIdentity } from '@/hooks/useIteraIdentity';
import { useLiveSound } from '@/hooks/useLiveSound';
import { useI18n } from '@/i18n';
import { persistActivityProgress } from '@/services/progress.service';
import { mergeLiveAnswers } from '@/utils/mergeLiveAnswers';
import type { Activity } from '@/types/content';
import type { ClassCompleter } from '@/types/liveClass';

const DECORATIVE_HEARTS = 5;

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

  const { data: lesson } = useLessonContent(session?.lessonId);
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
  useEffect(() => {
    const prev = prevActivityRef.current;
    if (currentActivityId && prev && prev !== currentActivityId) sound.onAdvance();
    prevActivityRef.current = currentActivityId;
  }, [currentActivityId, sound]);

  // Per-activity local answer state (result writes stay per-user). Reset whenever
  // the professor force-advances to a different activity.
  const [answered, setAnswered] = useState<{ id: string; correct: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setAnswered(null);
    setSaving(false);
  }, [currentActivityId]);

  async function handleComplete(correct: boolean) {
    if (!current || saving) return;
    // Force-advance model: answering does NOT move the student forward — only the
    // professor's pointer advances. We persist a correct result, and broadcast
    // EVERY answer (right or wrong) so the professor sees who has responded.
    setAnswered({ id: current.id, correct });
    sound.onAnswer(correct);
    if (correct) {
      setSaving(true);
      await persistActivityProgress(current.id);
      setSaving(false);
    }
    broadcastAnswer(current.id, correct);
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

      <main className="flex-1 w-full mx-auto max-w-5xl px-4 md:px-6 pt-14 md:pt-20">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground max-w-2xl mx-auto">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p>{t('live.connecting')}</p>
          </div>
        ) : !session ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground max-w-2xl mx-auto" data-testid="live-not-found">
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
          <div
            className={
              current
                ? 'grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6 lg:gap-8 items-start'
                : 'max-w-2xl mx-auto'
            }
          >
            <div className={current ? 'min-w-0 w-full max-w-2xl mx-auto lg:mx-0' : ''}>
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
            ) : !lessonLoaded ? (
              // Pointer set but the lesson content hasn't resolved yet (late-join /
              // reconnect) — activity SKELETON so a joiner with a live pointer goes
              // straight to the activity once it lands. (loop-1 fix #3.)
              <div className="mt-7 space-y-4" data-testid="live-activity-skeleton" aria-busy="true">
                <div className="h-6 w-2/3 rounded-lg ds-shimmer" />
                <div className="h-40 rounded-2xl ds-shimmer" />
                <div className="h-12 rounded-full ds-shimmer" />
              </div>
            ) : (
              // Lesson loaded, pointer set, but the activity isn't in the list
              // (transient pointer/lesson mismatch) — skeleton rather than a
              // misleading state.
              <div className="mt-7 space-y-4" data-testid="live-activity-skeleton" aria-busy="true">
                <div className="h-6 w-2/3 rounded-lg ds-shimmer" />
                <div className="h-40 rounded-2xl ds-shimmer" />
                <div className="h-12 rounded-full ds-shimmer" />
              </div>
            )}
            {current && (
              <div className="mt-7">
                {timer && timer.activityId === current.id && (
                  <div className="mb-5 flex justify-center">
                    <LiveTimer deadline={timer.deadline} onExpire={sound.onTimeUp} />
                  </div>
                )}
                {/* key on the activity id so a force-advance fully remounts the
                    renderer (fresh state) — the student loses the prior activity. */}
                <ActivityRenderer
                  key={current.id}
                  activity={{
                    ...current,
                    status: answered?.id === current.id && answered.correct ? 'done' : current.status,
                  }}
                  onComplete={handleComplete}
                />
                {answered?.id === current.id && (
                  <p
                    className={`mt-5 text-center text-sm ${answered.correct ? 'text-menta' : 'text-clay'}`}
                    data-testid="live-answered-hint"
                    data-correct={answered.correct ? 'true' : 'false'}
                  >
                    {answered.correct ? t('live.done.waitForNext') : t('live.wrong.waitForNext')}
                  </p>
                )}
              </div>
            )}
            </div>
            {current && (
              <aside className="space-y-5 lg:pt-1" data-testid="live-sidebar">
                <LiveRosterCard roster={roster} selfUserId={identity.userId} />
                <LiveAnswerersCard answerers={peerAnswerers} />
                <LiveSoundToggle />
              </aside>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
