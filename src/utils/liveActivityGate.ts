import type { LearnerGate, LearnerGateInput } from '@/types/liveClass';

/**
 * The learner-side interaction gate for a live activity — the single source of
 * truth for when a student may answer and when a completion may be
 * persisted/broadcast. Pure so it can be unit-tested without rendering the page.
 *
 * Invariants (Educar+ pilot feedback, round 2):
 *   - INTERACTIVE ON ARRIVAL: the moment the instructor advances to an activity
 *     the learner can answer it — there is NO pre-start gate. (Round-1 shipped a
 *     timer-armed gate and it made every activity read-only in practice, since
 *     concept/sandbox rounds never get a timer.)
 *   - EXPIRY LOCKS, NEVER COMPLETES: when a countdown the instructor DID start
 *     runs out before the learner answered, the activity locks (read-only) but
 *     is NEVER auto-completed or advanced — `canComplete` stays false.
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
