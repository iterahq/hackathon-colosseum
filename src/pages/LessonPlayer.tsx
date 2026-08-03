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
import { useParams, useNavigate } from 'react-router-dom';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { LessonChrome } from '@/components/branded/lesson/LessonChrome';
import { LessonCompleteCard } from '@/components/branded/lesson/LessonCompleteCard';
import { FeedbackFooter } from '@/components/branded/activity/FeedbackFooter';
import {
  isFooterGradedKind,
  type ActivityCompleteDetail,
  type FooterResult,
} from '@/components/branded/activity/activityFeedbackKinds';
import { isByocActivity } from '@/components/branded/activity/byoc/byocSpec';
import { useLessonContent, useNextLesson } from '@/hooks';
import { useI18n } from '@/i18n';
import {
  fetchActivityProgress,
  persistActivityProgress,
  resumeIndexFor,
} from '@/services/progress.service';
import { useAnswerOutbox, writeOrQueue } from '@/hooks/useAnswerOutbox';
import { useActivityDuration } from '@/hooks/useActivityDuration';
import type { DurationSample } from '@/utils/activityDuration';
import { useLessonSound } from '@/hooks/useLessonSound';
import { saveArtifact, type ProducedArtifact } from '@/services/artifact.service';
import { activityTitleOf, buildArtifact, buildRepoPath } from '@/services/artifactPolicy';
import { toast } from 'sonner';
// The kind→column-width rule is SHARED with the live-class surfaces
// (LiveSessionPage / live/InstructorClassPage) — see the module doc for the
// Monaco split-pane measurement behind `max-w-7xl`, and for why it must not be
// re-inlined per page.
import { columnMaxWidthClass } from '@/utils/activityColumnWidth';
import { canStepBack, stepBack, stepForward } from '@/utils/lessonNavigation';
import type { Activity, LessonPosition } from '@/types/content';

export default function LessonPlayer() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { t, tText } = useI18n();
  const { muted, toggleMuted, onSettle, onAdvance, onFinish } = useLessonSound();
  useAnswerOutbox();
  const { data, isPending, isError, refetch } = useLessonContent(lessonId);

  const activities = useMemo<Activity[]>(() => data?.activities ?? [], [data]);
  // Where this lesson sits in the hierarchy, for the artifact's git-shaped path.
  const placement = useMemo(() => data?.placement ?? {}, [data]);
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
  // The deterministic sibling of the above: a plain-text summary of the answer a
  // graded activity settled on. Held identically (a ref, across the footer's
  // review beat) and used ONLY when the author configured this activity to
  // persist — otherwise it is dropped, exactly as it was before 0027.
  const pendingResponseRef = useRef<string | null>(null);

  // True until the persisted progress for this lesson has been read back (or has
  // failed to read). We hold the first render behind it so the learner never
  // sees activity 1 flash before being moved to where they actually stopped.
  const [resuming, setResuming] = useState(true);
  // Which lesson has already been sought. A refetch (window focus) re-runs the
  // resume effect, and without this it would yank a learner who stepped BACK to
  // review right back to where they had stopped.
  const resumedForRef = useRef<string | null>(null);

  useEffect(() => {
    resumedForRef.current = null;
    setIndex(0);
    setDoneIds(new Set());
    setCompleted(false);
    setSaveError(false);
    setSaving(false);
    setPending(null);
    setResuming(true);
  }, [lessonId]);

  /**
   * RESUME (E2E finding D1). The player used to write itera.progress faithfully
   * and never read it back, so a learner who completed 10 activities and hit
   * reload was dropped on activity 1 with a zeroed counter and no indication
   * that any of it had been saved.
   *
   * We read the learner's own progress rows for exactly this lesson's activities
   * and land on the first one that is not yet 'completed'. Best-effort by
   * design: on any failure `fetchActivityProgress` resolves to `{}`, which
   * yields index 0 — the pre-fix behaviour — rather than blocking the lesson.
   *
   * Guarded by `cancelled` because the effect re-runs when the lesson changes
   * and a slow in-flight read must not seek the NEW lesson to the OLD lesson's
   * position.
   */
  useEffect(() => {
    // No lesson in the route → there is nothing to resume INTO. Release the gate
    // immediately: holding it would leave the player on the skeleton forever,
    // which is a worse failure than the flicker the gate exists to prevent.
    if (!lessonId) {
      setResuming(false);
      return;
    }
    if (activities.length === 0) {
      // Nothing to resume into. Only release the gate once the query has
      // actually settled, so an empty-while-loading lesson does not render
      // activity 1 for a frame and then jump.
      if (!isPending) setResuming(false);
      return;
    }
    if (resumedForRef.current === lessonId) return;
    let cancelled = false;
    const ids = activities.map((a) => a.id);
    void fetchActivityProgress(ids).then((statuses) => {
      if (cancelled) return;
      const done = ids.filter((id) => statuses[id] === 'completed');
      setDoneIds(new Set(done));
      const resumeAt = resumeIndexFor(ids, statuses);
      if (resumeAt >= ids.length) {
        // Everything is already done — go straight to the completion screen
        // instead of replaying a finished lesson from the top.
        setCompleted(true);
        setIndex(Math.max(0, ids.length - 1));
      } else {
        setIndex(resumeAt);
      }
      resumedForRef.current = lessonId;
      setResuming(false);
    });
    return () => {
      cancelled = true;
    };
    // `activities` is memoized off the query data, so this runs once per lesson
    // load rather than once per render.
  }, [lessonId, activities, isPending]);

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

  // ── Duration (plan 20260731-itera-eventos-aprendizagem, Phase 1) ───────────
  // The window OPENS here: the moment this activity became the one on screen for
  // this learner. It closes in `handleComplete`, when the answer settles — NOT
  // in `advance`, which runs after the learner has read the feedback footer.
  // Counting that review beat would inflate every graded kind by reading time.
  //
  // Held behind `resuming` on purpose: while the resume gate is up the learner is
  // looking at a skeleton, and an origin set there would bill the read-back of
  // itera.progress to the activity.
  const [activityStartedAt, setActivityStartedAt] = useState<number | null>(null);
  useEffect(() => {
    setActivityStartedAt(current?.id && !resuming ? Date.now() : null);
  }, [current?.id, resuming]);
  const duration = useActivityDuration(activityStartedAt);
  // The sample taken at settle time, held across the footer's review beat exactly
  // like the response ref below it, and cleared only once the write has landed so
  // `retrySave` replays the real measurement instead of re-timing the review.
  const pendingDurationRef = useRef<DurationSample | null>(null);
  // The wall-clock instant of that same settle, held for the same span and for
  // the same reason. It anchors the event trace (itera.activity_traces), and it
  // has to be captured HERE rather than at the write: for a graded kind the
  // write happens on the footer's "Continuar", and for a miss it can happen
  // after a trip through the offline outbox. Timestamping at write time would
  // date the learner's actions to the review beat or to the reconnection.
  const pendingSettledAtRef = useRef<number | null>(null);

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
    // An activity already finished cannot settle again. Review re-mounts the
    // shells, and some of them (the sandbox family) re-fire `onComplete` from a
    // mount effect when they read themselves as done — without this guard that
    // would raise the feedback footer over the review Continuar and write a
    // second attempt for work the learner is only re-reading.
    if (doneIds.has(current.id)) return;
    // CLOSE the duration window here — this instant is when the learner settled
    // the answer, which is the thing "how long did this take" is asking about.
    pendingDurationRef.current = duration.read();
    pendingSettledAtRef.current = Date.now();
    // Hold the produced content until the learner actually commits — graded and
    // BYOC kinds settle later, on the footer's "Continuar".
    pendingArtifactRef.current = detail?.artifact ?? null;
    // A deterministic activity (multiple choice, ordering, matching…) hands up
    // a plain-text summary of what the learner answered instead of a file. It
    // only becomes an artifact if the AUTHOR asked for one — see `advance`.
    pendingResponseRef.current = detail?.response ?? null;
    if (isFooterGradedKind(current.kind) || isByocActivity(current)) {
      // O veredito é AQUI, não no "Continuar": é neste instante que o aluno
      // descobre se passou, e era exatamente o som que faltava no self-paced.
      onSettle(correct);
      setPending({ correct, message: detail?.message, explanation: detail?.explanation });
      return;
    }
    void advance(correct);
  }

  // Persist the settled attempt + move to the next activity / completion. This
  // is the old `handleComplete` body; it now runs on the footer's "Continuar"
  // for graded kinds, or immediately for non-graded ones.
  async function advance(correct: boolean) {
    if (!current || saving) return;
    const isLast = index >= activities.length - 1;

    if (!correct) {
      // A MISS IS DATA (E2E finding D2). This used to be the silent branch: the
      // footer said "Não foi dessa vez", the learner clicked Continuar, and the
      // attempt vanished — no row in activity_results, progress or xp_events.
      // That is what made `passed` a column that only ever held `true`.
      //
      // We record WHAT was answered, not just that it was wrong: `response` is
      // the activity's own plain-text summary of the learner's answer (the
      // distractor they picked, the order they submitted, the text they wrote),
      // ridden up through the `detail` channel PR #193 established. A bare
      // boolean would count errors without preserving a single one of them.
      //
      // Deliberately NOT gated like the correct branch: a failed write must not
      // trap the learner on an activity they already saw the answer to, so we
      // fire and move on. The learner-visible flow is unchanged; only the
      // recording is new.
      const missedResponse = pendingResponseRef.current;
      const missedDuration = pendingDurationRef.current;
      const missedSettledAt = pendingSettledAtRef.current;
      // Clear the held refs on THIS path too. Previously only the correct branch
      // reset them, so a miss leaked its content into the next activity's commit.
      pendingArtifactRef.current = null;
      pendingResponseRef.current = null;
      pendingDurationRef.current = null;
      pendingSettledAtRef.current = null;
      // Via outbox: o acerto tem `retrySave` na tela, o erro não tinha recurso
      // nenhum — caiu a rede, o registro da tentativa sumia calado.
      void writeOrQueue({
        kind: 'progress',
        activityId: current.id,
        passed: false,
        response: missedResponse,
        duration: missedDuration,
        // Vai junto pela fila: se a rede só voltar daqui a meia hora, o trace
        // ainda tem que ser datado de QUANDO o aluno respondeu.
        settledAt: missedSettledAt ?? undefined,
      });
    }

    if (correct) {
      setSaving(true);
      // Shared per-user persistence (itera.progress + best-effort results/XP) —
      // identical write path used by the live-class session page.
      // READ (do not clear) the answer summary: the refs are only reset once the
      // write has landed, so that `retrySave` can replay a failed commit with
      // the learner's content intact.
      const ok = await persistActivityProgress(current.id, {
        passed: true,
        response: pendingResponseRef.current,
        // READ, do not clear — same rule as the response above, and for the same
        // reason: a failed write is retried by `retrySave`, and the retry must
        // replay the time the learner actually took, not the time they spent
        // looking at an error.
        duration: pendingDurationRef.current,
        // Same rule again, and here it is not hypothetical: for a graded kind
        // this line runs on the footer's "Continuar", so `Date.now()` inside the
        // service would be the end of the review beat, not the answer.
        settledAt: pendingSettledAtRef.current,
      });
      setSaving(false);
      if (ok) {
        // Persist what the learner PRODUCED, not just the fact that they
        // finished (plan 20260728-itera-artifact-storage, Phase 1). This is the
        // ONLY call site: routing it through the learner-facing player — rather
        // than the activity components — is what keeps the author TEST harness
        // write-free (canvas ADR-12), exactly like itera.progress above.
        //
        // WHAT gets persisted is no longer inferred from the kind: `buildArtifact`
        // merges the AUTHORED policy (itera.activities.artifact_policy, migration
        // 0027) with the per-kind default and returns null when this activity
        // does not persist. An activity configured `mode: 'always'` turns a
        // deterministic answer into a real deliverable through its template —
        // no AI in the loop.
        //
        // Deliberately best-effort and NOT awaited into the gate: a storage
        // hiccup must never strand a learner who correctly finished an activity.
        const produced = pendingArtifactRef.current;
        const response = pendingResponseRef.current;
        pendingArtifactRef.current = null;
        pendingResponseRef.current = null;
        pendingDurationRef.current = null;
        pendingSettledAtRef.current = null;

        const artifact = buildArtifact(current, produced, {
          response: response ?? undefined,
          title: activityTitleOf(current),
        });
        if (artifact) {
          const repoPath = buildRepoPath(artifact.filename, {
            programSlug: placement.programSlug,
            unitTitle: tText(placement.unitTitle ?? undefined),
            unitOrdinal: placement.unitOrdinal,
            lessonTitle: tText(data?.title),
            lessonOrdinal: placement.lessonOrdinal,
            activityOrdinal: current.ordinal,
            activityTitle: activityTitleOf(current),
          });
          void saveArtifact(current.id, artifact, { repoPath }).then((saved) => {
            // Only announce a save that actually happened. Staying silent on
            // failure is deliberate: `saveArtifact` is best-effort by design, and
            // an error toast here would tell a learner who correctly finished the
            // activity that something went wrong with work they cannot re-submit.
            if (!saved) return;
            toast.success(t('artifact.savedTitle'), {
              description: artifact.filename,
              duration: 8_000,
              action: {
                label: t('artifact.savedCta'),
                onClick: () => navigate('/artifacts'),
              },
            });
          });
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
      onAdvance();
      setIndex((i) => i + 1);
    } else {
      onFinish();
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

  /**
   * Free navigation over ground the learner has ALREADY covered (instructor
   * feedback 2026-08-01: "estou no exercício e quero voltar para o slide").
   * Neither of these writes progress — and `goForward` is deliberately NOT
   * `advance`: an activity that is already `done` is locked by `answerMachine`
   * (`done → locked → !acceptsSubmit`), so stepping back onto it would strand
   * the learner with no way out.
   */
  function applyPosition({ index: nextIndex, completed: nextCompleted }: LessonPosition) {
    setIndex(nextIndex);
    setCompleted(nextCompleted);
  }

  const position: LessonPosition = { index, completed };
  const goBack = () => applyPosition(stepBack(position, activities.length));
  const goForward = () => applyPosition(stepForward(position, activities.length));
  const goToStart = () => applyPosition({ index: 0, completed: false });
  const conceptContinue = () => handleComplete(true);

  /** Revisiting something already finished — the lesson reopens as a book. */
  const reviewing = current ? doneIds.has(current.id) : false;
  const canGoBack = !resuming && canStepBack(position, activities.length);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <LessonChrome
        progressPct={progressPct}
        muted={muted}
        onToggleMuted={toggleMuted}
        onClose={() => navigate(-1)}
        onBack={canGoBack ? goBack : undefined}
      />

      {/* ── Centered focused column ── */}
      {/* pb leaves room so the fixed FeedbackFooter never clips the SubmitButton. */}
      <main
        data-testid="lesson-main"
        className={`flex-1 w-full mx-auto ${maxWidthClass} px-4 md:px-6 ${
          isSandbox && !completed ? 'pt-4' : 'pt-14 md:pt-16'
        } ${pending ? 'pb-40' : isSandbox ? 'pb-4' : 'pb-40'}`}
      >
        {/* `resuming` shares the content skeleton on purpose: reading back where
            the learner stopped is part of loading the lesson, and showing
            activity 1 for a frame before seeking to activity 11 is precisely the
            flicker this gate exists to prevent. */}
        {isPending || resuming ? (
          <div className="space-y-4" data-testid="lesson-loading">
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
            <LessonCompleteCard
              doneCount={doneIds.size}
              total={activities.length}
              nextLessonId={nextLesson?.id}
              onReview={goToStart}
            />
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
                // `data-activity-id` makes WHICH activity is on screen assertable
                // from a test — the resume regression (D1) is precisely a claim
                // about identity, and "activity 3 is showing" is not otherwise
                // observable from the DOM.
                <div
                  className={isSandbox ? 'mt-4' : 'mt-7'}
                  data-testid="lesson-activity"
                  data-activity-id={current.id}
                >
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
                  instructor force-advances the cohort. `concept_reveal` rides
                  along: revealing the answer is reading too, so it never calls
                  onComplete and would otherwise be a dead end here. */}
              {/* On REVIEW the same button appears for every kind and steps
                  forward without grading: a `done` activity is locked by
                  `answerMachine`, so it has no submit of its own — and routing
                  it through `handleComplete` would re-award the XP. */}
              {(reviewing ||
                ((current?.kind === 'concept' || current?.kind === 'concept_reveal') &&
                  !isByocActivity(current))) && (
                <button
                  type="button"
                  onClick={reviewing ? goForward : conceptContinue}
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
