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
import { LessonTitle } from '@/components/branded/lesson/LessonTitle';
import { FeedbackFooter } from '@/components/branded/activity/FeedbackFooter';
import {
  isFooterGradedKind,
  type ActivityCompleteDetail,
  type FooterResult,
} from '@/components/branded/activity/activityFeedbackKinds';
import { isByocActivity } from '@/components/branded/activity/byoc/byocSpec';
import { isExerciseActivity } from '@/utils/isExerciseActivity';
import { useLessonContent, useNextLesson } from '@/hooks';
import { useI18n } from '@/i18n';
import { persistActivityProgress } from '@/services/progress.service';
import { resumeLesson } from '@/services/lessonResume.service';
import { useAnswerOutbox, writeOrQueue } from '@/hooks/useAnswerOutbox';
import { confirmLessonAnswer, type StoredLessonAnswer } from '@/utils/lessonAnswerStorage';
import { codeBudgetSpentAt } from '@/services/codeAttempts.service';
import { useLessonAnswers } from '@/hooks/useLessonAnswers';
import { useActivityDuration } from '@/hooks/useActivityDuration';
import { useAbandonmentBeacon } from '@/hooks/useAbandonmentBeacon';
import { buildSpecSnapshot, type RecordedAction } from '@/utils/learningTrace';
import { buildPedagogicalContext } from '@/utils/pedagogicalContext';
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
import {
  canStepBack,
  canStepForward,
  jumpToFrontier,
  stepBack,
  stepForward,
} from '@/utils/lessonNavigation';
import { lessonExitPath } from '@/utils/lessonExitPath';
import type { Activity, LessonPosition } from '@/types/content';
import { isScenarioKind, isSceneKind } from '@/utils/activityFamilies';

/**
 * The room under the content is the bar that is up (verdict footer or a scene's
 * hint bar, each publishing its own height) plus a gap — and only the gap while
 * none is. A fixed reserve was a bar's worth of scroll on every exercise that
 * had no bar up.
 */
const BAR_BOTTOM_RESERVE =
  'pb-[calc(max(var(--feedback-footer-h,0px),var(--scene-hint-h,0px),env(safe-area-inset-bottom,0px))+1rem)]';

/**
 * Tera peeks over the top-right corner of the card (56 px wide, 16 px in; 80 px
 * and 24 px from `md`) and his crest rises into the title line. The title gives
 * up that width only on the screens where he is there.
 */
const TITLE_CLEARS_TERA =
  'group-has-[[data-tera-peek]]/lesson:pr-[76px] md:group-has-[[data-tera-peek]]/lesson:pr-[108px]';

export default function LessonPlayer() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { t, tText, locale } = useI18n();
  const { muted, toggleMuted, onSettle, onAdvance, onFinish } = useLessonSound();
  useAnswerOutbox();
  const { data, isPending, isError, refetch } = useLessonContent(lessonId);

  const activities = useMemo<Activity[]>(() => data?.activities ?? [], [data]);
  // Where this lesson sits in the hierarchy, for the artifact's git-shaped path.
  const placement = useMemo(() => data?.placement ?? {}, [data]);
  const [index, setIndex] = useState(0);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(false);
  // The furthest activity the learner has reached by ANSWERING, hit or miss. A
  // miss moves on without entering `doneIds`, so the done set cannot say this.
  const [furthest, setFurthest] = useState(0);
  // The learner has been past the last activity (this session or a resumed one),
  // so forward from the last activity may reach the completion screen again.
  const [finished, setFinished] = useState(false);
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
  // What the learner answered on this device, hit or miss, read back on load.
  // `doneIds` (the server's `completed`) cannot say this: it holds no misses and
  // no answer content, so a reload re-opened every answered exercise blank.
  const { answers, retryCount, load: loadAnswers, record: recordAnswer, retry: retryAnswer } = useLessonAnswers();
  // The write the current exercise fired when it SETTLED. It used to wait for
  // the footer's "Continuar", so a refresh during the review beat erased a hit
  // and let a miss be dodged. `advance` awaits this instead of writing again.
  const settleWriteRef = useRef<{
    activityId: string;
    correct: boolean;
    promise: Promise<boolean>;
  } | null>(null);

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
    setFurthest(0);
    setFinished(false);
    setDoneIds(new Set());
    setCompleted(false);
    setSaveError(false);
    setSaving(false);
    setPending(null);
    setResuming(true);
    loadAnswers({});
    settleWriteRef.current = null;
  }, [lessonId, loadAnswers]);

  /**
   * RESUME (E2E finding D1). The player used to write itera.progress faithfully
   * and never read it back, so a learner who completed 10 activities and hit
   * reload was dropped on activity 1 with a zeroed counter and no indication
   * that any of it had been saved.
   *
   * `resumeLesson` reads the learner's own progress and attempt log for exactly
   * this lesson's activities, reconciles them with this device's record, and
   * says where to open: the first activity not yet answered. Best-effort by
   * design — a failed read degrades to the device's record, and with none to
   * index 0, rather than blocking the lesson.
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
    void resumeLesson(activities, () => cancelled).then((resume) => {
      if (!resume) return;
      setDoneIds(resume.doneIds);
      loadAnswers(resume.answers);
      // A lesson with everything done opens on the completion screen instead of
      // replaying from the top; one with misses left opens on the first of them.
      setCompleted(resume.completed);
      setFinished(resume.finished);
      setIndex(resume.index);
      setFurthest(resume.furthest);
      resumedForRef.current = lessonId;
      setResuming(false);
    });
    return () => {
      cancelled = true;
    };
    // `activities` is memoized off the query data, so this runs once per lesson
    // load rather than once per render.
  }, [lessonId, activities, isPending, loadAnswers]);

  const current = activities[index];
  // Answered before this visit — completed on the server, or settled on this
  // device and already past its review beat. The lesson reopens it as a book.
  const reviewing =
    !!current && (doneIds.has(current.id) || (!!answers[current.id] && pending === null && !saving));
  const missedBefore =
    reviewing && !!current && !doneIds.has(current.id) && answers[current.id]?.correct === false;

  // Sandbox activities own a fixed-height window and read best flush to the
  // chrome — the site's default vertical breathing room just pushes the window
  // into a scroll. Trim the top/bottom padding for the sandbox kind.
  const isSandbox = !!current && isScenarioKind(current.kind);
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
  //
  // ⚠️ DERIVED DURING RENDER, NOT IN AN EFFECT — and that is a correctness fix,
  // not a style preference. This used to be `useState` armed by a
  // `useEffect([current?.id, resuming])`. Effects run AFTER the commit, so there
  // was always one commit in which the activity was on screen, interactive, and
  // the origin was still null. Every handler bound in that commit closed over
  // the null, and `duration.read()` returns null without an origin — which
  // `buildAttemptTrace` then turns into NO TRACE AT ALL, because every `at_ms`
  // is an offset from an anchor that does not exist.
  //
  // That window was not theoretical: it made
  // `LessonPlayer.progressTruth.test.tsx` fail intermittently with *"expected
  // null to be 4500"* — a MISSING measurement, not a wrong one. Whether anything
  // settles inside the window is a scheduling question, which is why it failed
  // by machine load rather than by logic and never reproduced in isolation. The
  // regression lock for D2 (an attempt log that only ever held wins) has to be
  // believed when it is red; a gate that fails by race is a gate people learn to
  // ignore. `src/test/LessonPlayer.progressTruth.test.tsx` now settles from the
  // activity's MOUNT EFFECT — child effects flush before the parent's — which
  // lands inside that exact commit deterministically.
  //
  // A ref rather than `useMemo`: `useMemo` is a CACHE React may drop and
  // recompute, and a recomputation here would silently restart a learner's timer
  // mid-activity. The key comparison makes this idempotent — re-rendering does
  // not move an origin that is already set for the same activity.
  const originRef = useRef<{ key: string | null; at: number | null }>({ key: null, at: null });
  const originKey = current?.id && !resuming ? `${current.id}:${retryCount}` : null;
  if (originRef.current.key !== originKey) {
    originRef.current = { key: originKey, at: originKey === null ? null : Date.now() };
  }
  const activityStartedAt = originRef.current.at;
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
  // The rich SEQUENCE the activity handed up (`selection` / `arrangement`
  // families — src/utils/activityFamilies.ts), held across the review beat for
  // exactly the same reason as the two refs above: for a graded kind the write
  // happens on the footer's "Continuar", and a retry has to replay what the
  // learner actually did rather than an empty list.
  const pendingActionsRef = useRef<readonly RecordedAction[] | null>(null);

  // ── ABANDONED ATTEMPTS (LCPWCI Fase 1, migration 0040) ─────────────────────
  // Until this, a learner who opened an activity and left without answering
  // produced NO ROW ANYWHERE — not in `activity_results` (written only on a
  // settle), not in `progress` (only on reach/pass), not in `activity_traces`
  // (one row per settled attempt since 0034). That is precisely the give-up
  // signal Fase 4 wants, and it was being discarded at the instant it happened.
  //
  // The RULE for what counts is in `src/utils/abandonment.ts` — deliberately
  // not here, so it is testable without a DOM. This call only supplies the
  // facts, and every one of them comes from THIS screen, at RENDER time:
  // the origin it armed, the dwell it is measuring, the enunciado it rendered,
  // and the pedagogical tag of the activity it rendered. None of it can be
  // looked up at write time, because on the teardown path the write can happen
  // in the learner's NEXT session.
  //
  // ⚠️ `reviewing` matters: re-reading a completed activity and closing the
  // lesson is not abandoning an attempt, and without this guard every learner
  // reviewing a finished lesson would emit one.
  //
  // Memoized on the ACTIVITY and its ORIGIN — not because building the two
  // annotations is expensive, but because the beacon holds this object across
  // the render that changes it (see `fireFor`), and a stable identity per
  // attempt is the honest shape for something whose whole job is to describe
  // one attempt.
  const beaconTarget = useMemo(
    () =>
      current && activityStartedAt !== null
        ? {
            activityId: current.id,
            startedAt: activityStartedAt,
            read: duration.read,
            reviewing,
            specSnapshot: buildSpecSnapshot(current.spec, locale),
            pedagogicalContext: buildPedagogicalContext(current),
          }
        : null,
    [current, activityStartedAt, duration.read, reviewing, locale]
  );
  const beacon = useAbandonmentBeacon(beaconTarget);

  // OUT OF LIVES IS A MISS, even when the learner left before pressing the
  // exercise's own "Continuar". A `code` exercise mounted with its budget spent
  // has no submit and no way on — a reload there used to strand the lesson for
  // good. Recorded once, it re-opens locked like any other miss, with the retry
  // that returns the lives.
  const currentId = current?.id;
  useEffect(() => {
    if (!current || resuming || reviewing || pending !== null) return;
    const spentAt = codeBudgetSpentAt(current.id);
    if (spentAt === null) return;
    const activityId = current.id;
    const answer: StoredLessonAnswer = { correct: false, settledAt: spentAt, saved: false };
    // The learner answered — five times. Leaving now is not abandoning.
    beacon.markSettled(activityId);
    recordAnswer(activityId, answer);
    void writeOrQueue({
      kind: 'progress',
      activityId,
      passed: false,
      response: null,
      duration: null,
      settledAt: spentAt,
      specSnapshot: buildSpecSnapshot(current.spec, locale) ?? undefined,
      pedagogicalContext: buildPedagogicalContext(current),
    }).then(() => confirmLessonAnswer(activityId, spentAt));
    // Checked when an exercise comes on screen, not on every render: the budget
    // lives in localStorage, and the exercise shows its own verdict while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, resuming, retryCount]);

  // Next lesson (canonical order) — drives the end-of-lesson CTA. Best-effort:
  // resolves to null on the last lesson or any failure (CTA falls back to Finish).
  const { data: nextLesson } = useNextLesson(lessonId);

  // Progress fill: completed activities + the current one in flight.
  const progressPct = activities.length
    ? Math.round(((completed ? activities.length : index) / activities.length) * 100)
    : 0;

  // The activity emits its graded result UP here. GRADED kinds (MCQ family +
  // the sandbox terminal verdict) hold on screen and surface the fixed
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
    if (reviewing) return;
    // A pass already settled during this review beat stands; a kind that fires
    // again must not write a second pass (and a second XP award).
    const settled = settleWriteRef.current;
    if (settled?.activityId === current.id && settled.correct) return;
    // CLOSE the duration window here — this instant is when the learner settled
    // the answer, which is the thing "how long did this take" is asking about.
    pendingDurationRef.current = duration.read();
    pendingSettledAtRef.current = Date.now();
    // THIS instant is what disarms the abandonment beacon — not the write. For
    // a graded kind the write happens on the footer's "Continuar", and leaving
    // during that review beat is not abandoning an attempt: the learner
    // answered. It also revokes any abandonment already queued for this
    // activity by a `pagehide` the page came back from.
    beacon.markSettled(current.id);
    // Hold the produced content until the learner actually commits — graded and
    // BYOC kinds settle later, on the footer's "Continuar".
    pendingArtifactRef.current = detail?.artifact ?? null;
    // A deterministic activity (multiple choice, ordering, matching…) hands up
    // a plain-text summary of what the learner answered instead of a file. It
    // only becomes an artifact if the AUTHOR asked for one — see `advance`.
    pendingResponseRef.current = detail?.response ?? null;
    // The HOW, beside the WHAT. Absent for the families not yet wired, which
    // yields the honest two-action trace rather than a fabricated sequence.
    pendingActionsRef.current = detail?.actions ?? null;
    // The scene kinds join the footer path for the HOLD, not for a verdict:
    // their gesture completes them, and the learner must still see the guide's
    // reaction and the stamp before moving on — advancing on the gesture would
    // cut the "name it after" beat that is the whole point of the kind.
    const holds =
      isFooterGradedKind(current.kind) || isByocActivity(current) || isSceneKind(current.kind);
    // THE RESULT IS RECORDED HERE, not on "Continuar". Locally first, so a
    // reload in the very next instant still knows this exercise was answered.
    // A miss is kept for EVERY kind: a `code` exercise does not hold on the
    // footer, and without this it re-opened out of lives, with no way forward.
    if (holds || !correct) {
      const activityId = current.id;
      const answer: StoredLessonAnswer = {
        correct,
        settledAt: pendingSettledAtRef.current ?? Date.now(),
        saved: false,
        response: detail?.response,
        actions: detail?.actions ? [...detail.actions] : undefined,
      };
      recordAnswer(activityId, answer);
      const promise = writeSettled(current, correct).then((ok) => {
        // A miss is always durable (server or outbox); a pass only once it landed.
        if (ok) confirmLessonAnswer(activityId, answer.settledAt);
        return ok;
      });
      settleWriteRef.current = { activityId, correct, promise };
    }
    if (holds) {
      // O veredito é AQUI, não no "Continuar": é neste instante que o aluno
      // descobre se passou, e era exatamente o som que faltava no self-paced.
      if (!isSceneKind(current.kind)) onSettle(correct);
      setPending({ correct, message: detail?.message, explanation: detail?.explanation });
      return;
    }
    void advance(correct);
  }

  // Write one settled attempt. Runs at the SETTLE for the kinds that hold on the
  // footer, and from `advance` for the ones that move on immediately. Resolves
  // true once the attempt is durable: a miss always is (server or outbox), a
  // pass only when `itera.progress` actually landed.
  function writeSettled(activity: Activity, correct: boolean): Promise<boolean> {
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
      // Never gates the learner: a failed write goes to the durable outbox.
      const missedResponse = pendingResponseRef.current;
      const missedDuration = pendingDurationRef.current;
      const missedSettledAt = pendingSettledAtRef.current;
      const missedActions = pendingActionsRef.current;
      // Clear the held refs on THIS path too. Previously only the correct branch
      // reset them, so a miss leaked its content into the next activity's commit.
      pendingArtifactRef.current = null;
      pendingResponseRef.current = null;
      pendingDurationRef.current = null;
      pendingSettledAtRef.current = null;
      pendingActionsRef.current = null;
      // Via outbox: o acerto tem `retrySave` na tela, o erro não tinha recurso
      // nenhum — caiu a rede, o registro da tentativa sumia calado.
      return writeOrQueue({
        kind: 'progress',
        activityId: activity.id,
        passed: false,
        response: missedResponse,
        duration: missedDuration,
        // Vai junto pela fila: se a rede só voltar daqui a meia hora, o trace
        // ainda tem que ser datado de QUANDO o aluno respondeu.
        settledAt: missedSettledAt ?? undefined,
        // Um ERRO é onde a sequência vale mais: o QUE ele respondeu já está no
        // `response`; o COMO ele chegou lá é o que diz se foi chute ou tentativa.
        actions: missedActions ? [...missedActions] : undefined,
        // O ENUNCIADO que ELE leu (migration 0037). `activity.spec` já vem
        // resolvido pro locale pelo `programs.service`, e é o objeto que esta
        // tela acabou de renderizar — por isso o snapshot sai daqui e não do
        // serviço, que releria um `spec` mutável depois do fato.
        specSnapshot: buildSpecSnapshot(activity.spec, locale) ?? undefined,
        // O QUE essa atividade exercitava (migration 0038, Fase 1 do LCPWCI).
        // Sai daqui, da tela que acabou de renderizar, e não de um join na
        // análise: a tag muda por design (ADR-5 — gramática competitiva), então
        // um join daria a gramática de hoje a uma tentativa de anos atrás.
        pedagogicalContext: buildPedagogicalContext(activity),
        // Durable either way once this resolves: on the server, or in the outbox.
      }).then(() => true);
    }
    // The settle this write belongs to. The refs are only reset once the write
    // has landed, so `retrySave` can replay a failed commit with the learner's
    // content intact — and only if no later settle has replaced them since.
    const settledAt = pendingSettledAtRef.current;
    // Shared per-user persistence (itera.progress + best-effort results/XP) —
    // identical write path used by the live-class session page.
    // READ (do not clear) the answer summary: the refs are only reset once the
    // write has landed, so that `retrySave` can replay a failed commit with
    // the learner's content intact.
    return persistActivityProgress(activity.id, {
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
      // READ, do not clear — same rule as everything above it.
      actions: pendingActionsRef.current ?? undefined,
      // The enunciado THIS learner read, in the language they read it in
      // (migration 0037). Taken from the activity this screen just rendered:
      // `activities.spec` is mutable and locale-collapsed at render time, so
      // the only moment it can be captured truthfully is this one.
      specSnapshot: buildSpecSnapshot(activity.spec, locale),
      // Mesma regra do miss acima: a tag da atividade viaja COM a tentativa,
      // porque a gramática que a nomeia é viva por decisão (ADR-5).
      pedagogicalContext: buildPedagogicalContext(activity),
    }).then((ok) => {
      if (!ok) return false;
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
      if (pendingSettledAtRef.current === settledAt) {
        pendingArtifactRef.current = null;
        pendingResponseRef.current = null;
        pendingDurationRef.current = null;
        pendingSettledAtRef.current = null;
        pendingActionsRef.current = null;
      }

      const artifact = buildArtifact(activity, produced, {
        response: response ?? undefined,
        title: activityTitleOf(activity),
      });
      if (artifact) {
        const repoPath = buildRepoPath(artifact.filename, {
          programSlug: placement.programSlug,
          unitTitle: tText(placement.unitTitle ?? undefined),
          unitOrdinal: placement.unitOrdinal,
          lessonTitle: tText(data?.title),
          lessonOrdinal: placement.lessonOrdinal,
          activityOrdinal: activity.ordinal,
          activityTitle: activityTitleOf(activity),
        });
        void saveArtifact(activity.id, artifact, { repoPath }).then((saved) => {
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
      return true;
    });
  }

  // Move to the next activity / completion once the settled attempt is durable.
  // Runs on the footer's "Continuar" for graded kinds, or immediately for
  // non-graded ones.
  async function advance(correct: boolean) {
    if (!current || saving) return;
    const isLast = index >= activities.length - 1;
    const held = settleWriteRef.current?.activityId === current.id ? settleWriteRef.current : null;
    settleWriteRef.current = null;

    if (!correct) {
      if (!held) void writeSettled(current, false);
    } else {
      setSaving(true);
      // The settle-time write, or — if it failed, or this kind never held on
      // the footer — one made now.
      const ok = (held ? await held.promise : false) || (await writeSettled(current, true));
      setSaving(false);
      if (ok) {
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
      setFurthest((f) => Math.max(f, index + 1));
    } else {
      onFinish();
      setCompleted(true);
      setFinished(true);
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

  /** A miss stands until the learner chooses to try again — never by reload. */
  function retryMissed() {
    if (!current || !missedBefore) return;
    retryAnswer(current.id);
  }

  // An unsettled answer (footer up, or its write in flight) only moves on through the
  // footer's Continue: leaving by hand would drop the attempt unwritten.
  const unsettled = pending !== null || saving;
  const canGoBack = !resuming && !unsettled && canStepBack(position, activities.length);
  const frontier = furthest;
  const canNavigateForward = !resuming && !completed && activities.length > 1;
  // Same formula as `progressPct` (position-derived), applied to the frontier.
  const frontierPct = activities.length ? Math.round((frontier / activities.length) * 100) : 0;

  return (
    <div className="min-h-screen max-sm:min-h-svh max-sm:supports-[min-height:100dvh]:min-h-dvh bg-background flex flex-col">
      <LessonChrome
        progressPct={progressPct}
        frontierPct={frontierPct}
        muted={muted}
        onToggleMuted={toggleMuted}
        onClose={() => navigate(lessonExitPath(placement.programSlug))}
        onBack={canGoBack ? goBack : undefined}
        onForward={canNavigateForward ? goForward : undefined}
        forwardDisabled={unsettled || !canStepForward(position, frontier, finished)}
        onJumpToCurrent={
          canNavigateForward && !unsettled && frontier - index >= 2 ? () => applyPosition(jumpToFrontier(frontier)) : undefined
        }
      />

      {/* ── Centered focused column ── */}
      {/* pb leaves room so the fixed FeedbackFooter never clips the SubmitButton. */}
      <main
        data-testid="lesson-main"
        data-fit-viewport
        className={`group/lesson flex-1 w-full mx-auto ${maxWidthClass} px-4 md:px-6 ${
          isSandbox && !completed ? 'pt-4 max-sm:pt-[3.25rem]' : 'pt-[3.25rem]'
        } ${pending || !isSandbox ? BAR_BOTTOM_RESERVE : 'pb-4'}`}
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
                className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi sr-only"
                data-testid="lesson-eyebrow"
              >
                {t('lesson.eyebrow')}
              </div>

              {/* Big bold display title = the lesson title. When Tera peeks over the
                  card below, the line ends before his crest instead of running under it. */}
              <div className={TITLE_CLEARS_TERA}>
                <LessonTitle
                  text={tText(data.title)}
                  className="font-display font-bold text-xl md:text-2xl text-foreground truncate pb-1 -mb-1 max-sm:text-lg"
                />
              </div>

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
                    className="shrink-0 h-9 px-4 rounded-full bg-evergreen text-obsidiana text-sm font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-60"
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
                  className="mt-3"
                  data-testid="lesson-activity"
                  data-activity-id={current.id}
                >
                  <ActivityRenderer
                    key={`${current.id}:${retryCount}`}
                    activity={{ ...current, status: reviewing ? 'done' : current.status }}
                    onComplete={handleComplete}
                    priorAnswer={reviewing ? answers[current.id] : undefined}
                  />
                </div>
              )}

              {/* Content is pure reading — no in-card "mark done". Self-paced
                  advance lives here as a plain "Continuar" (navigation, not a
                  completion ceremony). The live class has no such button — the
                  instructor force-advances the cohort. The predicate covers
                  every reading kind, not just `concept`: while `diagram`/`video`
                  kept their own "concluir", clicking it scored a point in the
                  live podium for having read a slide. */}
              {/* On REVIEW the same button appears for every kind and steps
                  forward without grading: a `done` activity is locked by
                  `answerMachine`, so it has no submit of its own — and routing
                  it through `handleComplete` would re-award the XP. */}
              {/* A scene kind is reading, but GATED: no "Continuar" before the
                  gesture. Its completion raises the footer instead. */}
              {/* A missed exercise offers the retry BESIDE "Continuar", not under
                  it: a second row cost 60 px and pushed the retry off a short
                  phone (27 px on `order`, 125 px on `multi_choice` at 390×640). */}
              {(reviewing || (current && !isExerciseActivity(current) && !isSceneKind(current.kind))) && (
                <div className="mt-4 flex gap-3">
                  {missedBefore && (
                    <button
                      type="button"
                      onClick={retryMissed}
                      data-testid="lesson-retry-missed"
                      className="flex-1 min-w-0 inline-flex items-center justify-center h-12 px-4 rounded-full font-semibold border border-border text-foreground transition-colors hover:bg-card"
                    >
                      {t('common.retry')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={reviewing ? goForward : conceptContinue}
                    disabled={saving}
                    data-testid="concept-continue"
                    className="flex-1 min-w-0 inline-flex items-center justify-center gap-2 h-12 px-4 rounded-full font-semibold bg-evergreen text-obsidiana shadow-[0_4px_0_#249457] transition-[transform,box-shadow,background-color] duration-100 hover:bg-evergreen-hi active:translate-y-[3px] active:shadow-[0_1px_0_#249457] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {t('activity.continue')}
                  </button>
                </div>
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
