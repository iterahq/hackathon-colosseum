import { canReopenSubmission } from '@/utils/isAnswerableLiveKind';
import type { LearnerGate, LearnerGateInput } from '@/types/liveClass';

/**
 * The learner-side interaction gate for a live activity — the single source of
 * truth for when a student may answer and when a completion may be
 * persisted/broadcast. Pure so it can be unit-tested without rendering the page.
 *
 * Invariants (Educar+ pilot feedback):
 *   - INTERACTIVE ON ARRIVAL: the moment the instructor advances to an activity
 *     the learner can answer it — there is NO pre-start gate. (An early build
 *     shipped a timer-armed gate and it made every activity read-only in
 *     practice, since concept/sandbox rounds never get a timer.)
 *   - EXPIRY LOCKS, NEVER COMPLETES: when a countdown the instructor DID start
 *     runs out (or the instructor stops the clock) before the learner answered,
 *     the activity locks (read-only) but is NEVER auto-completed or advanced —
 *     `canComplete` stays false.
 *   - THE LOCK IS UNIVERSAL — every answerable kind, `code` INCLUDED (Tainan
 *     2026-07-23: "se acabar o clock deve disable tudo mesmo"). When the clock
 *     runs out it's "pens down" for whoever hasn't answered, regardless of
 *     whether the kind has a correct answer to put on screen. Reveal-button
 *     visibility is a SEPARATE concern (`hasRevealableAnswer` — code has no
 *     answer to show, so it gets no Reveal button) and must NOT be conflated
 *     with the lock again. An earlier build tied the lock to `hasRevealableAnswer`
 *     so `code` never locked; that contradicted the "pens down" rule and was
 *     reverted here.
 *   - ANSWERING IS NOT FINAL WHILE THE ROUND IS OPEN (ADR-1 do plano
 *     `20260728-itera-aula-ao-vivo-call-lideres`, Tainan 2026-07-28: "enquanto o
 *     timer tiver rolando, aluno pode voltar a editar (acho que tem que ser um
 *     clique explícito)"). `canReopen` is that authorization. It is bounded by
 *     EXPIRY, not by `timerRunning`: most live rounds run with no countdown armed
 *     at all, and requiring one would leave the affordance off exactly where the
 *     learner asked for it (first real class, 06/08). Once the clock runs out or
 *     the professor stops it, "pens down" wins over ADR-1.
 *   - ⚠️ REOPENING DOES NOT UN-ANSWER. `answered` means "a submitted answer of
 *     mine exists", and `reopened` is the separate fact that they are working on
 *     it again — because `locked` reads `answered`. Folding the two together (a
 *     reopen that flips `answered` back to false) put a learner whose countdown
 *     expired mid-edit on the "pens down" screen as if they had never answered,
 *     with their verdict gone from the UI while the row sat in the database.
 */
export function learnerActivityGate({
  timerRunning,
  expired,
  answered,
  reopened = false,
}: LearnerGateInput): LearnerGate {
  const started = timerRunning || expired;
  const locked = expired && !answered;
  const editing = answered && reopened && !expired;
  const readOnly = expired || (answered && !editing);
  const canComplete = !expired && (!answered || editing);
  const canReopen = answered && !reopened && !expired;
  return { started, locked, readOnly, canComplete, canReopen, editing };
}

/**
 * Both halves of the ADR-1 authorization, which is what a surface actually wants:
 * the ROUND (`gate.canReopen`) and the KIND (`canReopenSubmission`). Composed here
 * so no caller can get the conjunction half-right.
 */
export function canLearnerReopen(gate: LearnerGate, kind: string | null | undefined): boolean {
  return gate.canReopen && canReopenSubmission(kind);
}
