/**
 * Lesson player — steps through a lesson's real activities (document / diagram /
 * quiz / code). Evergreen progress pills, canonical labels, real itera data.
 *
 * Progress is best-effort persisted to itera.progress on completion (RLS-scoped
 * to the signed-in user); failures are swallowed so the UX never blocks.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { AppHeader } from '@/components/branded';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { useLessonContent } from '@/hooks';
import { useI18n } from '@/i18n';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';
import type { Activity } from '@/types/content';

export default function LessonPlayer() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { t, tText } = useI18n();
  const { data, isPending, isError, refetch } = useLessonContent(lessonId);

  const activities = useMemo<Activity[]>(() => data?.activities ?? [], [data]);
  const [index, setIndex] = useState(0);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    setIndex(0);
    setDoneIds(new Set());
    setCompleted(false);
  }, [lessonId]);

  const current = activities[index];

  async function persistProgress(activityId: string) {
    if (!isSupabaseConfigured) return;
    try {
      const sb = getSupabase();
      // RLS keys itera.progress / itera.activity_results on itera.users.id
      // (NOT the Supabase auth uid). Resolve the Itera-local user id first —
      // writing the raw auth uid silently FK-fails.
      const userId = await getIteraUserId();
      if (!userId) return;

      // Progress: upsert with the CORRECT enum value. The progress_status enum
      // is ('not_started','in_progress','completed') — 'done' is invalid.
      await sb
        .from('progress')
        .upsert(
          {
            user_id: userId,
            activity_id: activityId,
            status: 'completed',
            completed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,activity_id' }
        );

      // Results: INSERT the row the Results-API pull reads (per-tenant key sees
      // results of its members). Best-effort; one row per completion attempt.
      await sb
        .from('activity_results')
        .insert({ user_id: userId, activity_id: activityId, passed: true, score_internal: null });
    } catch {
      /* best-effort — never block the learner */
    }
  }

  function handleComplete(correct: boolean) {
    if (!current) return;
    if (correct) {
      const next = new Set(doneIds);
      next.add(current.id);
      setDoneIds(next);
      void persistProgress(current.id);
    }
    if (index < activities.length - 1) {
      setIndex((i) => i + 1);
    } else {
      setCompleted(true);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader active="discover" />
      <main className="flex-1 max-w-[900px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> {t('common.back')}
        </button>

        {isPending ? (
          <div className="space-y-4">
            <div className="h-8 w-1/2 rounded-lg ds-shimmer" />
            <div className="h-64 rounded-3xl ds-shimmer" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <p className="text-muted-foreground">{t('lesson.notFound')}</p>
            <button
              onClick={() => refetch()}
              className="h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : data ? (
          <>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-evergreen-hi">
              {t('label.lesson')}
            </div>
            <h1 className="font-display font-bold text-foreground mb-6">{tText(data.title)}</h1>

            {activities.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground">
                {t('lesson.noActivities')}
              </div>
            ) : completed ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-3xl border border-border bg-card p-10 text-center"
                data-testid="lesson-complete"
              >
                <div className="w-20 h-20 mx-auto rounded-3xl bg-evergreen-soft border border-evergreen/40 flex items-center justify-center">
                  <Trophy className="w-9 h-9 text-evergreen-hi" />
                </div>
                <h2 className="font-display text-foreground mt-5">{t('lesson.complete')}</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {doneIds.size}/{activities.length} {t('label.activities').toLowerCase()}
                </p>
                <Link
                  to="/"
                  className="mt-6 inline-flex h-11 px-6 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors items-center"
                >
                  {t('nav.discover')}
                </Link>
              </motion.div>
            ) : (
              <>
                {/* Progress pills */}
                <div className="flex items-center gap-2 mb-6" data-testid="progress-pills">
                  {activities.map((a, i) => {
                    const isDone = doneIds.has(a.id);
                    const isCurrent = i === index;
                    return (
                      <div
                        key={a.id}
                        className={`h-2 flex-1 rounded-full transition-colors ${
                          isDone
                            ? 'bg-evergreen'
                            : isCurrent
                              ? 'bg-evergreen/40'
                              : 'bg-muted'
                        }`}
                      />
                    );
                  })}
                </div>

                {current && (
                  <ActivityRenderer
                    key={current.id}
                    activity={{ ...current, status: doneIds.has(current.id) ? 'done' : current.status }}
                    onComplete={handleComplete}
                  />
                )}

                {/* Stepper nav */}
                <div className="flex items-center justify-between mt-6">
                  <button
                    disabled={index === 0}
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-border text-sm hover:border-verde-tech transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" /> {t('lesson.prev')}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {index + 1} / {activities.length}
                  </span>
                  <button
                    disabled={index >= activities.length - 1}
                    onClick={() => setIndex((i) => Math.min(activities.length - 1, i + 1))}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-border text-sm hover:border-verde-tech transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {t('lesson.next')} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
