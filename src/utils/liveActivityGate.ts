import { canReopenSubmission } from '@/utils/isAnswerableLiveKind';
import type { LearnerGate, LearnerGateInput } from '@/types/liveClass';

/**
 * The learner-side interaction gate for a live activity — the single source of
 * truth for when a student may answer and when a completion may be
 * persisted/broadcast. Pure so it can be unit-tested without rendering the page.
 *
 * Invariants (Educar+ pilot feedback):
 *   - INTERACTIVE ON ARRIVAL **UNLESS THIS ACTIVITY HAS A CLOCK**. An early
 *     build armed the gate on `timerRunning` alone and made EVERY activity
 *     read-only in practice, because concept/sandbox rounds never get a timer —
 *     so for a while there was no pre-start gate at all. Tainan asked for it
 *     back (2026-08-06, first class with real students: "travar disabled se
 *     timer tiver desativado — antes ou depois de terminar, n deve poder
 *     mexer"), and what makes it safe this time is that the caller passes
 *     `timerConfigured` from `liveTimerSeconds(kind, spec) > 0`, which is 0 for
 *     every non-answerable kind. A slide stays freely readable; a timed
 *     exercise waits for the professor's start.
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
 *   - THE PRE-START GATE OUTRANKS ADR-1 THE SAME WAY EXPIRY DOES. A learner who
 *     already submitted and then sees the clock rearmed (the professor navigates
 *     away and back, so `timerConfigured` is true again with `started` false) is
 *     in the same "n deve poder mexer" window as before any first answer — so
 *     `canReopen` and `editing` are both off there. Bounding ADR-1 only by
 *     expiry would have handed that learner an edit box the round had not opened
 *     yet, and the submit would land outside the window the professor timed.
 */
export function learnerActivityGate({
  timerRunning,
  expired,
  answered,
  reopened = false,
  timerConfigured = false,
}: LearnerGateInput): LearnerGate {
  const started = timerRunning || expired;
  // The clock is armed and has not been let go. Held apart from `awaitingStart`
  // because it also has to bound ADR-1, which `awaitingStart` cannot: that one
  // is false as soon as `answered` is true, and a learner who answered is
  // precisely who ADR-1 is about.
  const beforeStart = timerConfigured && !started;
  // Separate from `locked` on purpose: both are inert, but only the expiry one
  // may say "tempo esgotado" and reveal the answer. Folding them together told
  // the class time was up before the clock had even started.
  const awaitingStart = beforeStart && !answered;
  const locked = expired && !answered;
  const editing = answered && reopened && !expired && !beforeStart;
  const readOnly = expired || awaitingStart || (answered && !editing);
  const canComplete = !expired && !awaitingStart && (!answered || editing);
  const canReopen = answered && !reopened && !expired && !beforeStart;
  return { started, locked, awaitingStart, readOnly, canComplete, canReopen, editing };
}

/**
 * Both halves of the ADR-1 authorization, which is what a surface actually wants:
 * the ROUND (`gate.canReopen`) and the KIND (`canReopenSubmission`). Composed here
 * so no caller can get the conjunction half-right.
 */
export function canLearnerReopen(gate: LearnerGate, kind: string | null | undefined): boolean {
  return gate.canReopen && canReopenSubmission(kind);
}
