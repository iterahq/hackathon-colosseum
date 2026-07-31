/**
 * The learner-side ANSWER machine for a graded activity — the single source of
 * truth for the derived view-state every graded kind computes: is the answer
 * key on screen, are the inputs frozen, may this submission be accepted, and
 * what does the submit affordance look like.
 *
 * Pure, so the whole state matrix can be unit-tested without rendering — and
 * exhaustively, since the input space is five booleans (32 combinations).
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
 * `learnerActivityGate` (src/utils/liveActivityGate.ts) is the LIVE-CLASS gate:
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
   * until ACTUALLY submitted this session: on a merely-`done` or merely-
   * `reveal`ed render the learner's real answer is unknown, and coloring the
   * button green would be a lie.
   */
  gradeResult: boolean | undefined;
  /**
   * Render the ANSWER KEY instead of the learner's own answer — reveal without
   * a submission shows the correct sequence / the spec's pairs, not the
   * learner's untouched shuffle graded red. (Used by `order` and `match`.)
   */
  showKey: boolean;
}

/**
 * Derive the answer view-state. Total function: every one of the 32 boolean
 * combinations is defined and enumerated in `answerMachine.test.ts`.
 */
export function answerMachine({
  done,
  submitted,
  reveal = false,
  correct,
  hasAnswer,
}: AnswerMachineInput): AnswerMachineState {
  const shown = submitted || reveal;
  const locked = submitted || done || reveal;
  return {
    shown,
    locked,
    acceptsSubmit: !locked,
    submitLocked: submitted || done,
    submitDisabled: !hasAnswer || reveal,
    gradeResult: submitted ? correct : undefined,
    showKey: reveal && !submitted,
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
}: {
  shown: boolean;
  chosen: boolean;
  isCorrectOption: boolean;
}): ChoiceOptionState {
  if (shown && isCorrectOption) return 'correct';
  if (shown && chosen && !isCorrectOption) return 'wrong';
  return chosen ? 'chosen' : 'idle';
}
