import type { Activity } from '@/types/content';

/**
 * THREE different questions about an activity kind in a live class —
 * deliberately THREE predicates. Do NOT collapse them into one.
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
 *   3. `canReopenSubmission(kind)` — "may the learner take their submission back
 *      and work on it again?" (ADR-1 do plano
 *      `20260728-itera-aula-ao-vivo-call-lideres`). The timing half of that
 *      authorization is `learnerActivityGate.canReopen`; this is the KIND half,
 *      and the two are separate because the reason each says no is different.
 *
 * The first two diverge on two kinds, in OPPOSITE directions — which is the whole reason
 * neither one can be derived from the other:
 *   - `code` IS answerable, and whether it has anything to reveal is a question
 *     about the ROW, not the kind — see `activityHasRevealableAnswer` below. The
 *     kind-level `hasRevealableAnswer('code')` stays FALSE.
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
 * If you add a new kind, ask ALL THREE questions separately before editing the
 * sets.
 */

/** Kinds with an answer FLOW (learner produces something) → eligible for a timer. */
const ANSWERABLE_KINDS: ReadonlySet<string> = new Set([
  'single_choice',
  'multi_choice',
  'match',
  'order',
  'quiz',
  'code',
  // Os dois kinds de sandbox — sem timer, o ao-vivo não tem contagem nem
  // trava de "canetas no chão".
  'chat_sandbox',
  'terminal_sandbox',
  // `question` (2026-08-28) — ANSWERABLE: the person produces something (an
  // option set, prose, or both), so it earns a countdown and it must go
  // read-only on expiry like every other answerable kind ("pens down").
  //
  // ⚠️ THIS SET IS SILENT. A kind left out of it is not a compile error and not
  // a failing test — it simply never gets a timer and never locks, and the only
  // way anyone finds out is a live class where the clock runs out and one
  // activity stays editable. That is why the entry carries a reason instead of
  // being one more line.
  'question',
  // The ONE-BEHAVIOUR kinds (plan `20260924-activity-type-one-behavior-rule`):
  // each one answers exactly like the old kind it came from. The `document_*`
  // and `byoc_*` kinds stay OUT, like `document` and the BYOC `concept` rows.
  'code_editor_checks',
  'code_editor_ungraded',
  'code_fill_bank',
  'code_fill_select',
  'code_fill_type',
  'chat_compose',
  'chat_fill_select',
  'chat_fill_type',
  'chat_pick_context',
  'chat_rate_reply',
  'terminal_type_command',
  'terminal_pick_command',
  'terminal_build_command',
  'question_pick_one',
  'question_pick_many',
  'question_write',
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
  'chat_sandbox',
  'terminal_sandbox',
  'concept_reveal',
  // The one-behaviour sandbox kinds reveal like the sandboxes they came from.
  'chat_compose',
  'chat_fill_select',
  'chat_fill_type',
  'chat_pick_context',
  'chat_rate_reply',
  'terminal_type_command',
  'terminal_pick_command',
  'terminal_build_command',
  // The guided code kinds carry `blanks[].answer` — the KIND says so now, so
  // they need no spec probe (`isGuidedCodeActivity`). The two editor kinds
  // carry no authored solution and stay out.
  'code_fill_bank',
  'code_fill_select',
  'code_fill_type',
  // `question` (and its three one-behaviour kinds) is DELIBERATELY ABSENT — and this is the third question the
  // header tells you to ask separately, answered.
  //
  // There is nothing to reveal. A question has no correct answer; its
  // `recommended_option_id` is what the ASKER leans toward, and putting that on
  // the projector as "the answer" is the precise lie the whole kind exists to
  // avoid. The invariant this set is held to — *every kind here RENDERS
  // something when it gets `reveal`* — would also be false: `QuestionActivity`
  // takes no `reveal` prop at all, so the button would stop the clock and
  // change nothing, which is the exact `code` trap that split these predicates
  // in the first place.
]);

/**
 * Kinds whose submission the learner may reopen and redo (ADR-1).
 *
 * ⚠️ THE MEMBERSHIP RULE IS "DID THE FEEDBACK HAND OVER THE ANSWER?", and it is
 * the OPPOSITE of `REVEALABLE_ANSWER_KINDS` for a reason that is pedagogical,
 * not technical: on an MCQ family kind the learner has already SEEN the right
 * option by the time they could reopen, so a second try is not a second attempt
 * — it is a free point, and the podium would rank the room by who clicked
 * "editar" instead of who knew the answer.
 *
 * `code` is the one kind where the verdict says WHICH check failed and never the
 * solution, so reopening costs real work — and it is the kind a learner actually
 * asked to reopen in the first real class (06/08).
 *
 * The sandbox kinds are deliberately OUT even though they are answerable: they
 * already own an in-window critique→retry loop
 * (`components/branded/activity/sandbox/useSandboxScenario.ts`), so bolting a
 * second reopen on top would give the same round two different ways back.
 */
const REOPENABLE_KINDS: ReadonlySet<string> = new Set([
  'code',
  // Every one-behaviour code kind reopens like `code` did (plan T9).
  'code_editor_checks',
  'code_editor_ungraded',
  'code_fill_bank',
  'code_fill_select',
  'code_fill_type',
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

/**
 * May the learner reopen their own submission on this kind? The WHEN is
 * `learnerActivityGate.canReopen`; use `canLearnerReopen` to ask both at once.
 */
export function canReopenSubmission(kind: string | null | undefined): boolean {
  return !!kind && REOPENABLE_KINDS.has(kind);
}

/**
 * Guided `code`: a locked template whose holes carry an AUTHORED answer.
 *
 * Read as plain data (`spec.blanks`), never through `@iterahq/activities/code`.
 * That entrypoint is off-limits to anything the base bundle can reach
 * (`scripts/assert-entrypoint-isolation.mjs`), and this predicate is called from
 * the instructor page, which is base. The shape check is the same one the package
 * makes — a non-empty `blanks` array — and the Zod schema forbids `blanks`
 * together with `checks`, so the two code surfaces cannot both claim one row.
 */
export function isGuidedCodeActivity(activity: Activity | null | undefined): boolean {
  if (!activity) return false;
  // The one-behaviour kinds SAY it (T9): no spec probe for them.
  if (
    activity.kind === 'code_fill_bank' ||
    activity.kind === 'code_fill_select' ||
    activity.kind === 'code_fill_type'
  ) {
    return true;
  }
  // The transition kind `code` keeps the shape probe until its rows move.
  if (activity.kind !== 'code') return false;
  const spec = activity.spec;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return false;
  const blanks = (spec as { blanks?: unknown }).blanks;
  return Array.isArray(blanks) && blanks.length > 0;
}

/**
 * The ROW-level reveal question, and the one the instructor's button asks.
 *
 * `code` is why this exists on top of `hasRevealableAnswer`: the two code
 * surfaces answer differently and the kind alone cannot tell them apart. The
 * guided variants carry `blanks[].answer` — a gabarito the author already wrote —
 * so revealing shows something. The open editor carries only `checks`, so a
 * button there would stop the clock and reveal nothing, which is the exact trap
 * that split these predicates in the first place.
 */
export function activityHasRevealableAnswer(activity: Activity | null | undefined): boolean {
  if (!activity) return false;
  return hasRevealableAnswer(activity.kind) || isGuidedCodeActivity(activity);
}
