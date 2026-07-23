/**
 * TWO different questions about an activity kind in a live class — deliberately
 * TWO predicates. Do NOT collapse them back into one.
 *
 *   1. `isAnswerableLiveKind(kind)` — "does the learner PRODUCE something here?"
 *      Drives the shared countdown (`liveTimerSeconds`): a content kind
 *      (concept/video/document/diagram) gets no timer at all. Also the set that
 *      the expiry LOCK applies to — when the clock runs out, EVERY answerable
 *      kind goes read-only for whoever hasn't answered (`learnerActivityGate`,
 *      "pens down", Tainan 2026-07-23), `code` included.
 *
 *   2. `hasRevealableAnswer(kind)` — "is there a CORRECT ANSWER we can put on
 *      screen?" Drives ONLY the instructor's "Revelar resposta" control. It does
 *      NOT gate the learner lock — the lock is universal over answerable kinds.
 *
 * They differ on exactly one kind today: `code`.
 *   - `code` IS answerable → it gets a countdown (5 min, see `liveTimerSeconds`)
 *     AND it locks on expiry like everything else.
 *   - `code` has NO revealable answer → the `code` spec carries no solution
 *     field, and `ActivityRenderer` does not even pass `reveal` down to
 *     `CodeSnackActivity`. There is literally nothing to show → no Reveal button.
 *
 * WHY THIS SPLIT EXISTS (the bug that created it): while ONE predicate answered
 * both questions, "Revelar resposta" appeared on a code exercise. Clicking it
 * revealed nothing and merely stopped the timer. The two questions are genuinely
 * distinct, so keep them apart — BUT note the lock is NOT one of the things the
 * reveal predicate governs (an earlier build wired `hasRevealableAnswer` into the
 * lock so `code` never locked; that contradicted "pens down" and was reverted).
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
 * Is there a correct answer we can put on screen for this kind? Use ONLY for the
 * instructor's Reveal control (button visibility). Do NOT use it to gate the
 * learner lock — the expiry lock is universal over `isAnswerableLiveKind`.
 */
export function hasRevealableAnswer(kind: string | null | undefined): boolean {
  return !!kind && REVEALABLE_ANSWER_KINDS.has(kind);
}
