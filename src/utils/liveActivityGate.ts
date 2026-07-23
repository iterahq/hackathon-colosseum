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
 *   - THE LOCK NEEDS A REVEALED ANSWER TO JUSTIFY IT (round 3): the lock exists
 *     so nobody can answer AFTER the correct answer went up on screen. On a kind
 *     with nothing to reveal (`code` — no solution in the spec, no `reveal` prop
 *     wired to `CodeSnackActivity`) the lock protects nothing and just freezes a
 *     student mid-exercise. So `revealable: false` means expiry still marks the
 *     round as `started`, still stops the countdown — but never takes the
 *     keyboard away. See `hasRevealableAnswer` in `@/utils/isAnswerableLiveKind`.
 */
export function learnerActivityGate({
  timerRunning,
  expired,
  answered,
  // Defaults to `true` so every existing caller/behaviour (the whole
  // choice/quiz/match/order/sandbox family) is bit-for-bit unchanged; only a
  // caller that explicitly says "nothing to reveal here" opts out of the lock.
  revealable = true,
}: LearnerGateInput): LearnerGate {
  const started = timerRunning || expired;
  const locked = expired && !answered && revealable;
  const readOnly = locked || answered;
  const canComplete = !locked && !answered;
  return { started, locked, readOnly, canComplete };
}
