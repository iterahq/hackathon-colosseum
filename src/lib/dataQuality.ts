/**
 * The truth boundary for Itera performance data.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Until 2026-07-28, `itera.activity_results` only ever received a row when the
 * learner answered CORRECTLY, and the row was written with `passed: true` as a
 * hard-coded literal (`persistActivityProgress` was called from inside an
 * `if (correct)` branch). A wrong answer produced no row in `activity_results`,
 * none in `progress`, and none in `xp_events` — the UI gave feedback, revealed
 * the right answer, advanced, and kept nothing.
 *
 * The consequence is not "the accuracy numbers were miscalculated". It is that
 * the input to those numbers was never collected. Every accuracy figure the
 * product has ever shown — the live-class report's "% de acerto", the admin
 * panel's completion averages, any per-kind success rate — was structurally
 * incapable of returning anything other than 100%. A DB-wide count on
 * 2026-07-28 read 473 `passed = true` rows against 3 `passed = false`, and all
 * three `false` rows came from a seed fixture, not from a real learner.
 *
 * THE HISTORY IS NOT RECOVERABLE
 * ------------------------------
 * There is nothing to backfill. A backfill restores rows that were written and
 * later lost; these rows were never written. No log, no audit table, no event
 * stream holds the wrong answers — the client discarded them at the moment they
 * happened. Any attempt to "reconstruct" pre-cutover accuracy would be
 * fabricating data, so we deliberately do not. Pre-cutover rows are kept exactly
 * as they are, correctly labelled, and simply excluded from accuracy.
 *
 * WHAT IS AND IS NOT AFFECTED
 * ---------------------------
 * - ACCURACY (pass rate, "% de acerto", per-kind success) — pre-cutover: junk.
 *   The denominator is missing every miss, so the rate is pinned at 100%.
 * - COMPLETION / ENGAGEMENT (which activities a learner finished, XP, streaks) —
 *   pre-cutover: still usable. A completion was only ever recorded on a correct
 *   answer, which is what "completed" meant then and still means now. The bug
 *   lost failures, not successes.
 *
 * Read `ACCURACY_TRUSTWORTHY_SINCE` as: rows created at or after this instant
 * come from the fixed write path and include misses; rows before it do not.
 */

/**
 * The instant the fixed write path started recording wrong answers.
 *
 * Set to the UTC day boundary of the deploy that landed the fix rather than the
 * exact deploy minute: it is the conservative direction (a few pre-fix hours are
 * excluded from "trustworthy" rather than a few post-fix ones being wrongly
 * included), and a date is what a human reading a dashboard footnote can
 * actually act on.
 */
export const ACCURACY_TRUSTWORTHY_SINCE = '2026-07-29T00:00:00.000Z';

/** Same boundary as a `Date`, for comparisons. */
export const ACCURACY_TRUSTWORTHY_SINCE_DATE = new Date(ACCURACY_TRUSTWORTHY_SINCE);

/**
 * True when a row created at `when` came from the fixed write path, i.e. when a
 * wrong answer would have been recorded had one happened. Rows failing this test
 * must never feed an accuracy figure.
 */
export function isAccuracyTrustworthy(when: string | Date | null | undefined): boolean {
  if (!when) return false;
  const at = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() >= ACCURACY_TRUSTWORTHY_SINCE_DATE.getTime();
}

/**
 * True when the accuracy figure being rendered draws on any pre-cutover data and
 * therefore needs the caveat shown next to it. Surfaces that aggregate "all
 * time" always do; a surface scoped to a single post-cutover live session does
 * not.
 */
export function needsAccuracyCaveat(earliestSampleAt?: string | Date | null): boolean {
  if (earliestSampleAt === undefined) return true; // unknown window → assume yes
  return !isAccuracyTrustworthy(earliestSampleAt);
}
