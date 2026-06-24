/**
 * Lesson player — steps through a lesson's real activities (document / diagram /
 * quiz / code) in a FOCUSED, IMMERSIVE chrome that mirrors the target design:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ ✕            ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  (full-width progress)   ♥ 5 │
 *   │                                                                │
 *   │                ⑃ PULL · FEATURE/<branch>                       │
 *   │                Superposition                                   │
 *   │                ┌──────── question card ────────┐              │
 *   │                │ TRUE OR FALSE?                 │              │
 *   │                │ <bold question>                │              │
 *   │                └────────────────────────────────┘              │
 *   │                [   True   ] [   False   ]                      │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * NO AppHeader, NO sticky sub-header — the only chrome is the full-width
 * progress bar + the close-X (top-left) + a decorative hearts indicator
 * (top-right). The X and hearts are INERT chrome (no lives backend), like a
 * bell/settings icon. The centered column holds the eyebrow, big title and
 * the activity body.
 *
 * Progress is best-effort persisted to itera.progress on completion (RLS-scoped
 * to the signed-in user); failures are swallowed so the UX never blocks. The
 * persist / XP logic below is UNCHANGED — only the presentation was rebuilt.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { X, Heart, Trophy } from 'lucide-react';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { useLessonContent } from '@/hooks';
import { useI18n } from '@/i18n';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';
import { awardActivityXp } from '@/services/gamification.service';
import type { Activity } from '@/types/content';

/** Decorative lives count — inert chrome (no lives backend). */
const DECORATIVE_HEARTS = 5;

/** Slugify a lesson/unit title into a FEATURE/<branch> name for the eyebrow. */
function toBranchName(raw: string | undefined): string {
  const slug = (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (slug || 'main').toUpperCase();
}

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

  // Eyebrow branch name — derived from the lesson title (chrome flavour only).
  const branch = useMemo(() => `FEATURE/${toBranchName(tText(data?.title))}`, [data, tText]);

  // Progress fill: completed activities + the current one in flight.
  const progressPct = activities.length
    ? Math.round(((completed ? activities.length : index) / activities.length) * 100)
    : 0;

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

      // XP: award once per activity. awardActivityXp delegates to the IDEMPOTENT
      // SECURITY DEFINER RPC (partial unique index on xp_events(user_id, reason)
      // + ON CONFLICT DO NOTHING), so re-completing never double-awards — which
      // is why we don't gate on a not-completed -> completed transition
      // client-side. Best-effort; failure never blocks the learner.
      await awardActivityXp(activityId);
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
      {/* ── Immersive chrome: full-width progress bar + X (left) + hearts (right) ── */}
      <header className="relative">
        {/* Full-width thin progress track, flush to the very top edge. */}
        <div
          className="h-1 w-full bg-muted"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('label.activities')}
          data-testid="lesson-progress"
        >
          <div
            className="h-full bg-evergreen transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
            data-testid="lesson-progress-fill"
          />
        </div>

        {/* Close-X — circular bordered button, top-left. */}
        <button
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          data-testid="lesson-close"
          className="absolute top-2.5 left-3 md:left-4 w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Hearts — decorative lives indicator, top-right (inert chrome). */}
        <div
          className="absolute top-2.5 right-3 md:right-4 h-9 flex items-center gap-1.5 text-foreground"
          data-testid="lesson-hearts"
          aria-hidden="true"
        >
          <Heart className="w-4 h-4 fill-clay text-clay" />
          <span className="font-mono text-sm tabular-nums">{DECORATIVE_HEARTS}</span>
        </div>
      </header>

      {/* ── Centered focused column ── */}
      <main className="flex-1 w-full mx-auto max-w-2xl px-4 md:px-6 pt-10 md:pt-16">
        {isPending ? (
          <div className="space-y-4">
            <div className="h-5 w-1/3 rounded ds-shimmer" />
            <div className="h-9 w-2/3 rounded-lg ds-shimmer" />
            <div className="h-48 rounded-3xl ds-shimmer" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-muted-foreground">{t('lesson.notFound')}</p>
            <button
              onClick={() => refetch()}
              className="w-full h-12 px-5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : data ? (
          activities.length === 0 ? (
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
                className="mt-6 flex w-full h-12 px-6 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors items-center justify-center"
              >
                {t('nav.discover')}
              </Link>
            </motion.div>
          ) : (
            <>
              {/* Eyebrow: ⑃ PULL · FEATURE/<branch> (green JB-Mono uppercase). */}
              <div
                className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi"
                data-testid="lesson-eyebrow"
              >
                <span aria-hidden="true">⑃ </span>
                {t('lesson.eyebrowAction')} <span className="text-muted-foreground">·</span> {branch}
              </div>

              {/* Big bold display title = the lesson title. */}
              <h1
                className="font-display font-bold text-3xl md:text-4xl text-foreground mt-1.5"
                data-testid="lesson-title"
              >
                {tText(data.title)}
              </h1>

              {current && (
                <div className="mt-7">
                  <ActivityRenderer
                    key={current.id}
                    activity={{ ...current, status: doneIds.has(current.id) ? 'done' : current.status }}
                    onComplete={handleComplete}
                  />
                </div>
              )}
            </>
          )
        ) : null}
      </main>
    </div>
  );
}
