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
 * They diverge on two kinds, in OPPOSITE directions — which is the whole reason
 * neither one can be derived from the other:
 *   - `code` IS answerable but has NOTHING to reveal → it gets a countdown
 *     (5 min, see `liveTimerSeconds`) and locks on expiry like everything else,
 *     but the spec carries no solution field and `ActivityRenderer` does not even
 *     pass `reveal` down to `CodeSnackActivity`. No Reveal button.
 *   - `concept_reveal` is the MIRROR IMAGE: nothing to answer, but an answer to
 *     show. It produces nothing, so no countdown and nothing to lock — and yet
 *     the whole point of the kind is that the professor decides WHEN the answer
 *     appears (instructor feedback 2026-08-01: "algo mais para perguntar ali no
 *     slide e depois mostrar a resposta pra galera"). It needs the Reveal button.
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
  // Os três kinds de sandbox — sem timer, o ao-vivo não tem contagem nem
  // trava de "canetas no chão" numa row migrada.
  'sandbox_scenario',
  'chat_sandbox',
  'terminal_sandbox',
]);

/**
 * Kinds with a correct answer that can actually be DISPLAYED.
 *
 * Deliberately spelled out instead of derived from `ANSWERABLE_KINDS` — a new
 * answerable kind must be a conscious opt-in here, never an inherited default
 * (that inheritance is exactly what shipped the "Revelar resposta" trap).
 *
 * INVARIANT (asserted in tests): every kind here RENDERS something when it gets
 * `reveal`. That is the property the button actually depends on. It used to be
 * stated as "strict subset of `ANSWERABLE_KINDS`", which was a proxy that held
 * only while producing an answer and having one to show were the same thing —
 * `concept_reveal` is the counterexample that separated them.
 */
const REVEALABLE_ANSWER_KINDS: ReadonlySet<string> = new Set([
  'single_choice',
  'multi_choice',
  'match',
  'order',
  'quiz',
  'sandbox_scenario',
  'chat_sandbox',
  'terminal_sandbox',
  'concept_reveal',
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
