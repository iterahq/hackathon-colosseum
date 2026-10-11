/**
 * The learner-side ANSWER machine for a graded activity — the single source of
 * truth for the derived view-state every graded kind computes: is the answer
 * key on screen, are the inputs frozen, may this submission be accepted, and
 * what does the submit affordance look like.
 *
 * Pure, so the whole state matrix can be unit-tested without rendering — and
 * exhaustively, since the input space is six booleans (64 combinations).
 *
 * ── The sixth input: `restored` ─────────────────────────────────────────────
 * `done` alone says "the learner finished this in an EARLIER session". It never
 * said WHAT they answered, so the machine refused to grade that render — see
 * `gradeResult`. A host that persists the learner's answer can now hand it back
 * (`<ActivityRenderer priorAnswer={…}>`), the kind seeds its own inputs from it,
 * and the kind reports `restored: true`. Only then does a `done` render carry a
 * verdict.
 *
 * ⚠️ `restored` is NOT a licence to grade. It is gated on `done` INSIDE the
 * machine, so a fresh (`todo`) activity cannot be jumped to the answered state
 * by handing it a payload — plan `20260728-itera-activity-testing`, ADR-4.
 * With `restored` omitted every output is bit-identical to what it was before
 * this input existed, which `answerMachine.test.ts` asserts over the whole
 * matrix.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * This tuple used to be hand-copied in SIX places, character for character:
 *   SingleChoiceActivity · MultiChoiceActivity · MatchActivity · OrderActivity ·
 *   the inline QuizActivity (ActivityRenderer) · byoc/ByocTree
 * Six copies of `shown = submitted || reveal` is six chances to fix a grading
 * rule in five of them. The copies had ALREADY diverged in two ways (both
 * preserved here, deliberately — see `acceptsSubmit` and `reveal`).
 *
 * ── Relationship to `learnerActivityGate` ───────────────────────────────────
 * `learnerActivityGate` (the Player's src/utils/liveActivityGate.ts) is the LIVE-CLASS gate:
 * it answers "may the student touch this activity at all right now?" from the
 * instructor's clock. THIS machine is the WITHIN-ACTIVITY answer state: given
 * that the student may interact, what does the activity itself look like. They
 * compose — the gate's `readOnly`/`locked` is what the live stage turns into
 * this machine's `reveal`/`done` inputs. Neither subsumes the other, and this
 * module deliberately does NOT import the gate: a self-paced lesson has no
 * clock at all, and must not grow a dependency on live-class types.
 *
 * ── What this machine does NOT decide ───────────────────────────────────────
 * Grading. `correct` is an INPUT: only the kind knows whether "the selected id
 * equals correct_option_id" / "the pair set matches" / "the order matches".
 * The machine decides when that verdict is allowed to reach the screen.
 */

/** Everything a graded activity knows about its own answer state. */
export interface AnswerMachineInput {
  /** `activity.status === 'done'` — completed in an EARLIER session. */
  done: boolean;
  /** The learner pressed "Enviar" in THIS session. */
  submitted: boolean;
  /**
   * The answer key is exposed WITHOUT a submission (instructor stopped/expired
   * the clock). Kinds that never reveal (quiz) simply pass `false`.
   */
  reveal?: boolean;
  /**
   * The kind-specific grading verdict for the CURRENT answer. Always computed,
   * never gated — the machine is what gates it (see `gradeResult`).
   */
  correct: boolean;
  /**
   * The learner's PRIOR answer was replayed into this render's inputs.
   *
   * The kind sets this to `true` only when it actually seeded its own answer
   * state from `ActivityRendererProps.priorAnswer` — that is, when the payload
   * carried a real `answer_submitted` action whose selection the kind could
   * resolve against its own spec. A payload with no selection, or with ids the
   * spec does not know, leaves this `false` and the render stays exactly what
   * it is today.
   *
   * Kinds that cannot restore simply omit it.
   */
  restored?: boolean;
  /**
   * The kind-specific "there is an answer worth submitting" precondition:
   * `selected !== null` (single/quiz), `selected.length > 0` (multi),
   * `touched` (order — the list arrives pre-populated by the shuffle, so
   * "non-empty" would be true before the learner did anything),
   * `made.length === expected` (match), `isAnswerComplete(tree, answer)` (byoc).
   */
  hasAnswer: boolean;
}

/** The derived view-state every graded kind renders from. */
export interface AnswerMachineState {
  /**
   * Correctness styling / the answer key is on screen. Drives per-option
   * green-check / red-cross, the match badge state, the order position colors.
   */
  shown: boolean;
  /** The answer inputs are frozen (options, cards, drag handles, verdict buttons). */
  locked: boolean;
  /**
   * A submit attempt should proceed. Guards `handleSubmit` against a double
   * submit, a re-submit of an already-done activity, and submitting while the
   * answer key is on screen.
   */
  acceptsSubmit: boolean;
  /**
   * The `submitted` prop of `<SubmitButton>` — the button's own locked
   * "Enviado" look. NOTE this is `submitted || done`, NOT `locked`: an activity
   * merely being `reveal`ed must not claim the learner sent something.
   */
  submitLocked: boolean;
  /**
   * The `disabled` prop of `<SubmitButton>`. `SubmitButton` ORs this with its
   * own `submitted` prop, so it deliberately omits `done`/`submitted` — they
   * are already covered by `submitLocked`.
   */
  submitDisabled: boolean;
  /**
   * The `correct` prop of `<SubmitButton>` — the graded color. `undefined`
   * until the learner's real answer is KNOWN to this render, which happens in
   * exactly two ways: they submitted it in THIS session (`submitted`), or the
   * host replayed the one they submitted in an earlier one (`done && restored`).
   *
   * On a merely-`done` or a merely-`reveal`ed render the answer is still
   * unknown, and coloring the button green would still be a lie.
   */
  gradeResult: boolean | undefined;
  /**
   * Render the ANSWER KEY instead of the learner's own answer — reveal without
   * a known answer shows the correct sequence / the spec's pairs, not the
   * learner's untouched shuffle graded red. (Used by `order` and `match`.)
   *
   * A RESTORED answer is a known answer, so it wins over the key: the whole
   * point of the replay is to show what the learner arranged, and painting the
   * solution over it would hide the one thing the render exists to say.
   */
  showKey: boolean;
}

/**
 * Derive the answer view-state. Total function: every one of the 64 boolean
 * combinations is defined and enumerated in `answerMachine.test.ts`.
 */
export function answerMachine({
  done,
  submitted,
  reveal = false,
  restored = false,
  correct,
  hasAnswer,
}: AnswerMachineInput): AnswerMachineState {
  // THE one new term. Everything that used to read `submitted` and meant "the
  // learner's answer is known" now reads `graded`; everything that read
  // `submitted` and meant "they pressed the button in THIS session" still does.
  // Separating the two is the whole change — they were the same boolean only
  // because a replayed answer had no way in.
  const graded = submitted || (done && restored);
  const shown = graded || reveal;
  const locked = submitted || done || reveal;
  return {
    shown,
    locked,
    acceptsSubmit: !locked,
    // NOT `graded`: a `done` render already said "Enviado" before any replay
    // existed, and a restore must not change WHETHER the learner submitted —
    // only WHAT they submitted.
    submitLocked: submitted || done,
    submitDisabled: !hasAnswer || reveal,
    gradeResult: graded ? correct : undefined,
    showKey: reveal && !graded,
  };
}

/** How a single choice-option renders once the machine says the verdict is `shown`. */
export type ChoiceOptionState = 'correct' | 'wrong' | 'chosen' | 'idle';

/**
 * The per-option styling state shared verbatim by `single_choice`,
 * `multi_choice` and the inline `quiz`. Pre-verdict an option is only ever
 * `chosen` or `idle` (neutral); post-verdict the correct option is flagged
 * green whether or not the learner picked it, and a wrong PICK is flagged red.
 * An unpicked wrong option stays neutral — we mark what the learner got wrong,
 * not every distractor.
 */
export function choiceOptionState({
  shown,
  chosen,
  isCorrectOption,
  hideKey = false,
}: {
  shown: boolean;
  chosen: boolean;
  isCorrectOption: boolean;
  /** The host keeps the answer key off a miss: only what the learner picked is marked. */
  hideKey?: boolean;
}): ChoiceOptionState {
  if (shown && isCorrectOption && !hideKey) return 'correct';
  if (shown && chosen && !isCorrectOption) return 'wrong';
  return chosen ? 'chosen' : 'idle';
}
