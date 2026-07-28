/**
 * Lesson player — steps through a lesson's real activities (document / diagram /
 * quiz / code) in a FOCUSED, IMMERSIVE chrome that mirrors the target design:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ ✕            ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  (full-width progress)   ♥ 5 │
 *   │                                                                │
 *   │                LIÇÃO                                            │
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { X, Heart, Trophy } from 'lucide-react';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { FeedbackFooter } from '@/components/branded/activity/FeedbackFooter';
import {
  isFooterGradedKind,
  type ActivityCompleteDetail,
  type FooterResult,
} from '@/components/branded/activity/activityFeedbackKinds';
import { isByocActivity } from '@/components/branded/activity/byoc/byocSpec';
import { useLessonContent, useNextLesson } from '@/hooks';
import { useI18n } from '@/i18n';
import { persistActivityProgress } from '@/services/progress.service';
import { saveArtifact, type ProducedArtifact } from '@/services/artifact.service';
// The kind→column-width rule is SHARED with the live-class surfaces
// (LiveSessionPage / live/InstructorClassPage) — see the module doc for the
// Monaco split-pane measurement behind `max-w-7xl`, and for why it must not be
// re-inlined per page.
import { columnMaxWidthClass } from '@/utils/activityColumnWidth';
import type { Activity } from '@/types/content';

/** Decorative lives count — inert chrome (no lives backend). */
const DECORATIVE_HEARTS = 5;

export default function LessonPlayer() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { t, tText } = useI18n();
  const { data, isPending, isError, refetch } = useLessonContent(lessonId);

  const activities = useMemo<Activity[]>(() => data?.activities ?? [], [data]);
  const [index, setIndex] = useState(0);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(false);
  // True when the last persistProgress write FAILED — we surface a retry instead
  // of a false success trophy (round-2 nit: never celebrate an unsaved completion).
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  // The settled result for the GLOBAL fixed feedback footer (Duolingo pattern).
  // A graded activity's `onComplete(correct)` sets this; the activity STAYS on
  // screen showing its graded state, and only the footer's "Continuar" advances.
  // Non-graded kinds (concept/video/document) advance immediately (no footer).
  const [pending, setPending] = useState<FooterResult | null>(null);
  // Content the current activity produced, held between `handleComplete` and the
  // commit in `advance`. A ref (not state) on purpose — it must not trigger a
  // re-render, and it must survive the footer's review beat unchanged.
  const pendingArtifactRef = useRef<ProducedArtifact | null>(null);

  useEffect(() => {
    setIndex(0);
    setDoneIds(new Set());
    setCompleted(false);
    setSaveError(false);
    setSaving(false);
    setPending(null);
  }, [lessonId]);

  const current = activities[index];
  // Sandbox activities own a fixed-height window and read best flush to the
  // chrome — the site's default vertical breathing room just pushes the window
  // into a scroll. Trim the top/bottom padding for the sandbox kind.
  const isSandbox = current?.kind === 'sandbox_scenario';
  // Width of the focused column follows the activity KIND (see
  // `columnMaxWidthClass`). The completion/loading/error states are plain prose
  // cards, so they always keep the narrow measure.
  const maxWidthClass = columnMaxWidthClass(completed ? undefined : current?.kind);

  // Clear a stale footer whenever the activity on screen changes.
  useEffect(() => {
    setPending(null);
  }, [current?.id]);

  // Next lesson (canonical order) — drives the end-of-lesson CTA. Best-effort:
  // resolves to null on the last lesson or any failure (CTA falls back to Finish).
  const { data: nextLesson } = useNextLesson(lessonId);

  // Progress fill: completed activities + the current one in flight.
  const progressPct = activities.length
    ? Math.round(((completed ? activities.length : index) / activities.length) * 100)
    : 0;

  // The activity emits its graded result UP here. GRADED kinds (MCQ family +
  // the sandbox_scenario terminal verdict) hold on screen and surface the fixed
  // footer; the footer's "Continuar" is what actually advances (the Duolingo
  // review-then-continue beat). The optional `detail` lets the activity ride its
  // own settled explanation (the sandbox reveal recap) into the footer without
  // the shell recomputing it. Every other kind (concept/video/document "mark
  // done") advances immediately as before.
  function handleComplete(correct: boolean, detail?: ActivityCompleteDetail) {
    if (!current || saving) return;
    // Hold the produced content until the learner actually commits — graded and
    // BYOC kinds settle later, on the footer's "Continuar".
    pendingArtifactRef.current = detail?.artifact ?? null;
    if (isFooterGradedKind(current.kind) || isByocActivity(current)) {
      setPending({ correct, message: detail?.message, explanation: detail?.explanation });
      return;
    }
    void advance(correct);
  }

  // Persist (on a correct answer) + move to the next activity / completion. This
  // is the old `handleComplete` body; it now runs on the footer's "Continuar"
  // for graded kinds, or immediately for non-graded ones.
  async function advance(correct: boolean) {
    if (!current || saving) return;
    const isLast = index >= activities.length - 1;

    if (correct) {
      setSaving(true);
      // Shared per-user persistence (itera.progress + best-effort results/XP) —
      // identical write path used by the live-class session page.
      const ok = await persistActivityProgress(current.id);
      setSaving(false);
      if (ok) {
        // Persist what the learner PRODUCED, not just the fact that they
        // finished (plan 20260728-itera-artifact-storage, Phase 1). This is the
        // ONLY call site: routing it through the learner-facing player — rather
        // than the activity components — is what keeps the author TEST harness
        // write-free (canvas ADR-12), exactly like itera.progress above.
        //
        // Deliberately best-effort and NOT awaited into the gate: a storage
        // hiccup must never strand a learner who correctly finished an activity.
        const produced = pendingArtifactRef.current;
        if (produced) {
          pendingArtifactRef.current = null;
          void saveArtifact(current.id, produced);
        }
        setDoneIds((prev) => new Set(prev).add(current.id));
        setSaveError(false);
      } else {
        // The completion did NOT persist — surface a retry, do NOT advance and do
        // NOT show a success trophy (the footer stays up). Retrying re-runs this.
        setSaveError(true);
        return;
      }
    }

    setPending(null);
    if (!isLast) {
      setIndex((i) => i + 1);
    } else {
      setCompleted(true);
    }
  }

  function handleContinue() {
    if (!pending) return;
    void advance(pending.correct);
  }

  function retrySave() {
    void advance(pending?.correct ?? true);
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
      {/* pb leaves room so the fixed FeedbackFooter never clips the SubmitButton. */}
      <main
        data-testid="lesson-main"
        className={`flex-1 w-full mx-auto ${maxWidthClass} px-4 md:px-6 ${
          isSandbox ? 'pt-4' : 'pt-10 md:pt-16'
        } ${pending ? 'pb-40' : isSandbox ? 'pb-4' : 'pb-40'}`}
      >
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
              {/* End-of-lesson CTA (round-3 finding #4): when a next lesson exists,
                  offer "Próxima lição" routing straight into it; otherwise the
                  course is over → "Concluir" back to the dashboard. The old CTA
                  always sent the learner to "Descobrir" (dashboard), which read
                  as confusing on a "5/5 lições concluídas" screen. */}
              {nextLesson ? (
                <Link
                  to={`/lesson/${nextLesson.id}`}
                  className="mt-6 flex w-full h-12 px-6 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors items-center justify-center"
                  data-testid="lesson-next-cta"
                >
                  {t('lesson.nextLesson')}
                </Link>
              ) : (
                <Link
                  to="/"
                  className="mt-6 flex w-full h-12 px-6 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors items-center justify-center"
                  data-testid="lesson-finish-cta"
                >
                  {t('lesson.finishCourse')}
                </Link>
              )}
            </motion.div>
          ) : (
            <>
              {/* Eyebrow: learner-friendly "LIÇÃO" label (green JB-Mono uppercase).
                  Canonical labels per ADR `frontend-canonical-labels-always` —
                  the git-metaphor "PULL · FEATURE/<branch>" was dropped (round-3
                  finding #1: it read as "am I in the right place?" to non-devs). */}
              <div
                className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi"
                data-testid="lesson-eyebrow"
              >
                {t('lesson.eyebrow')}
              </div>

              {/* Big bold display title = the lesson title. */}
              <h1
                className="font-display font-bold text-3xl md:text-4xl text-foreground mt-1.5"
                data-testid="lesson-title"
              >
                {tText(data.title)}
              </h1>

              {saveError && (
                <div
                  className="mt-7 rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-sm text-foreground flex items-center justify-between gap-3"
                  role="alert"
                  data-testid="lesson-save-error"
                >
                  <span>{t('lesson.saveError')}</span>
                  <button
                    onClick={retrySave}
                    disabled={saving}
                    data-testid="lesson-save-retry"
                    className="flex-shrink-0 h-9 px-4 rounded-full bg-evergreen text-obsidiana text-sm font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-60"
                  >
                    {t('lesson.retrySave')}
                  </button>
                </div>
              )}

              {current && (
                <div className={isSandbox ? 'mt-4' : 'mt-7'}>
                  <ActivityRenderer
                    key={current.id}
                    activity={{ ...current, status: doneIds.has(current.id) ? 'done' : current.status }}
                    onComplete={handleComplete}
                  />
                </div>
              )}

              {/* Concept is pure reading — no in-card "mark done". Self-paced
                  advance lives here as a plain "Continuar" (navigation, not a
                  completion ceremony). The live class has no such button — the
                  instructor force-advances the cohort. */}
              {current?.kind === 'concept' && !isByocActivity(current) && (
                <button
                  type="button"
                  onClick={() => handleComplete(true)}
                  disabled={saving}
                  data-testid="concept-continue"
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full font-medium bg-evergreen text-obsidiana hover:bg-evergreen-hi transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {t('activity.continue')}
                </button>
              )}
            </>
          )
        ) : null}
      </main>

      {/* ── Global fixed answer-feedback footer (Duolingo pattern) ──
          Slides up green/red after a graded submit; "Continuar" advances. */}
      {!completed && (
        <FeedbackFooter result={pending} onContinue={handleContinue} busy={saving} />
      )}
    </div>
  );
}
