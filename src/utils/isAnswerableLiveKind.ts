/**
 * TWO different questions about an activity kind in a live class — deliberately
 * TWO predicates. Do NOT collapse them back into one.
 *
 *   1. `isAnswerableLiveKind(kind)` — "does the learner PRODUCE something here?"
 *      Drives the shared countdown (`liveTimerSeconds`): a content kind
 *      (concept/video/document/diagram) gets no timer at all.
 *
 *   2. `hasRevealableAnswer(kind)` — "is there a CORRECT ANSWER we can put on
 *      screen?" Drives the instructor's "Revelar resposta" control and the
 *      learner gate's read-only LOCK (`learnerActivityGate`).
 *
 * They differ on exactly one kind today: `code`.
 *   - `code` IS answerable → it gets a countdown (5 min, see `liveTimerSeconds`).
 *   - `code` has NO revealable answer → the `code` spec carries no solution
 *     field, and `ActivityRenderer` does not even pass `reveal` down to
 *     `CodeSnackActivity`. There is literally nothing to show.
 *
 * WHY THIS SPLIT EXISTS (the bug that created it): while ONE predicate answered
 * both questions, "Revelar resposta" appeared on a code exercise. Clicking it
 * revealed nothing and merely stopped the timer — which the learner gate turned
 * into a read-only LOCK. Net effect: the whole class frozen mid-exercise with no
 * answer on screen. The lock only earns its keep when a correct answer IS on
 * screen (otherwise copying it would be free); with nothing revealed, locking is
 * pure damage.
 *
 * If you add a new kind, ask BOTH questions separately before editing the sets.
 */

/** Kinds with an answer FLOW (learner produces something) → eligible for a timer. */
const ANSWERABLE_KINDS: ReadonlySet<string> = new Set([
  'single_choice',
  'multi_choice',
  'match',
  'order',
  'quiz',
  'code',
  'sandbox_scenario',
]);

/**
 * Kinds with a correct answer that can actually be DISPLAYED.
 *
 * Deliberately spelled out instead of derived from `ANSWERABLE_KINDS` — a new
 * answerable kind must be a conscious opt-in here, never an inherited default
 * (that inheritance is exactly what shipped the "Revelar resposta" trap).
 * INVARIANT: this is a strict subset of `ANSWERABLE_KINDS` (asserted in tests).
 */
const REVEALABLE_ANSWER_KINDS: ReadonlySet<string> = new Set([
  'single_choice',
  'multi_choice',
  'match',
  'order',
  'quiz',
  'sandbox_scenario',
]);

/**
 * Does this kind have an answer flow? Use for TIMER decisions only.
 * NOT a proxy for "we can reveal an answer" — use `hasRevealableAnswer` there.
 */
export function isAnswerableLiveKind(kind: string | null | undefined): boolean {
  return !!kind && ANSWERABLE_KINDS.has(kind);
}

/**
 * Is there a correct answer we can put on screen for this kind? Use for the
 * instructor's Reveal control and for any read-only LOCK justified by "the
 * answer is now visible".
 */
export function hasRevealableAnswer(kind: string | null | undefined): boolean {
  return !!kind && REVEALABLE_ANSWER_KINDS.has(kind);
}
