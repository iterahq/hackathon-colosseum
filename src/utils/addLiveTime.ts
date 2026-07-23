/**
 * Pure math behind the professor's "+tempo" control (add seconds to the shared
 * live countdown). Kept out of the React tree so the "sum to remaining" and
 * ceiling rules are unit-testable without a channel or a clock.
 *
 * The control ADDS, it never SETS: 40s left + 60s ⇒ 100s. When stopped, the
 * same helper folds the added seconds into the next start's duration.
 */

/**
 * The most we ever put on the clock via add-time — mirrors the per-activity
 * timer override ceiling (1h, `LIVE_TIMER_MAX_SECONDS`) so the live countdown
 * can't be pushed to an absurd value by repeated taps.
 */
export const ADD_TIME_MAX_TOTAL_SECONDS = 3600;

/**
 * Whole seconds left on a running countdown, from its absolute deadline (ms
 * epoch) and "now" (ms). Never negative; rounds UP so a fractional final second
 * still contributes a second of budget to add onto.
 */
export function remainingSeconds(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

/**
 * Resulting countdown duration after ADDING `addSeconds` onto `baseSeconds`
 * (the remaining time when running, or the pre-set duration when stopped).
 * Clamped to `[0, ADD_TIME_MAX_TOTAL_SECONDS]`.
 */
export function extendedTimerSeconds(baseSeconds: number, addSeconds: number): number {
  const total = Math.max(0, Math.floor(baseSeconds)) + Math.max(0, Math.floor(addSeconds));
  return Math.min(total, ADD_TIME_MAX_TOTAL_SECONDS);
}
