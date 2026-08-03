/**
 * Pure math behind the professor's time control (nudge the shared live countdown
 * by a signed delta). Kept out of the React tree so the "sum to remaining" and
 * clamping rules are unit-testable without a channel or a clock.
 *
 * The delta is SIGNED: 40s left + 60s ⇒ 100s, and 60s − 30s ⇒ 30s. When
 * stopped, the same helper folds the delta into the next start's duration.
 */

/**
 * The most we ever put on the clock — mirrors the per-activity timer override
 * ceiling (1h, `LIVE_TIMER_MAX_SECONDS`) so the live countdown can't be pushed
 * to an absurd value by repeated taps.
 */
export const ADD_TIME_MAX_TOTAL_SECONDS = 3600;

/**
 * The least we ever put on the clock. It is NOT zero on purpose: the whole timer
 * block is rendered behind `timerSeconds > 0`, so subtracting to zero would take
 * away the very control the professor needs to undo it.
 */
export const ADD_TIME_MIN_TOTAL_SECONDS = 5;

/**
 * Whole seconds left on a running countdown, from its absolute deadline (ms
 * epoch) and "now" (ms). Never negative; rounds UP so a fractional final second
 * still contributes a second of budget to add onto.
 */
export function remainingSeconds(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

/**
 * Resulting countdown duration after applying the SIGNED `deltaSeconds` onto
 * `baseSeconds` (the remaining time when running, or the pre-set duration when
 * stopped). Clamped to `[ADD_TIME_MIN_TOTAL_SECONDS, ADD_TIME_MAX_TOTAL_SECONDS]`.
 *
 * Subtraction exists because the lesson's authored duration is the FLOOR the
 * professor lands on, not a choice: he asked for 30s on a question that starts
 * at 1min and had no way down (feedback da aula, 2026-08-02).
 */
export function adjustedTimerSeconds(baseSeconds: number, deltaSeconds: number): number {
  const total = Math.max(0, Math.floor(baseSeconds)) + Math.floor(deltaSeconds);
  return clampTimerSeconds(total);
}

/** The same ceiling/floor applied to an ABSOLUTE duration the professor typed. */
export function clampTimerSeconds(seconds: number): number {
  const whole = Math.floor(seconds);
  if (!Number.isFinite(whole)) return ADD_TIME_MIN_TOTAL_SECONDS;
  return Math.min(Math.max(whole, ADD_TIME_MIN_TOTAL_SECONDS), ADD_TIME_MAX_TOTAL_SECONDS);
}
