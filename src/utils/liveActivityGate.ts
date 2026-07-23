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
 */
export function learnerActivityGate({
  timerRunning,
  expired,
  answered,
}: LearnerGateInput): LearnerGate {
  const started = timerRunning || expired;
  const locked = expired && !answered;
  const readOnly = locked || answered;
  const canComplete = !locked && !answered;
  return { started, locked, readOnly, canComplete };
}
