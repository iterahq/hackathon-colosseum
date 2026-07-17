import type { LearnerGate, LearnerGateInput } from '@/types/liveClass';

/**
 * The learner-side interaction gate for a live activity — the single source of
 * truth for when a student may answer, when the stage is inert, and when a
 * completion may be persisted/broadcast. Pure so it can be unit-tested without
 * rendering the whole page.
 *
 * Two invariants it encodes (from the Educar+ pilot feedback):
 *   - PRE-START (P0-2): an activity the instructor advanced to but hasn't STARTED
 *     (no timer yet) is inert — no answering before the go signal.
 *     `sandbox_scenario` is facilitator-driven, so it's exempt.
 *   - EXPIRY LOCKS, NEVER COMPLETES (P0-1): when the countdown runs out before the
 *     learner answered, the activity locks (read-only) but is NEVER auto-completed
 *     or advanced — `canComplete` stays false, so nothing persists/broadcasts.
 */
export function learnerActivityGate({
  kind,
  timerRunning,
  expired,
  answered,
}: LearnerGateInput): LearnerGate {
  const started = timerRunning || expired;
  const preStart = kind !== 'sandbox_scenario' && !started;
  const locked = expired && !answered;
  const readOnly = locked || answered || preStart;
  const canComplete = !preStart && !locked && !answered;
  return { started, preStart, locked, readOnly, canComplete };
}
