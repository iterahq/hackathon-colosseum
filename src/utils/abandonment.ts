/**
 * WHAT COUNTS AS AN ABANDONED ATTEMPT — the rule, as a pure function.
 *
 * Plan `20260803-itera-learning-control-plane-prototipo` (LCPWCI), **Fase 1**,
 * approved by Tainan TG 2026-08-04. Storage:
 * `itera.activity_traces.outcome = 'abandoned'` (migration 0040).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE, IN ONE SENTENCE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * An attempt is ABANDONED when an activity was rendered for a learner, stayed
 * on screen for at least `MIN_ABANDONMENT_VISIBLE_MS` of VISIBLE time, produced
 * no settled answer, and then the surface that rendered it went away — the
 * learner navigated on, left the lesson, or the page was torn down.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ WHAT AN ABANDONED ROW DOES *NOT* CLAIM — read this before using the data
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It is NOT evidence that the learner found the activity hard. It is evidence
 * that they LEFT. From inside the browser, "this is too difficult" and "the
 * bell rang", "the battery died", "someone called", "I was only browsing",
 * "I read it and moved on" are the same observation. The abandonment RATE of an
 * activity, compared against the rate of its siblings under the same conditions,
 * is a difficulty signal. A single abandoned row is not, and Fase 4's matrix is
 * built precisely so those comparisons are between activities that differ in
 * one attribute — which is the only way this data becomes interpretable.
 *
 * Stated here rather than in a report, because the report will be written by
 * somebody who did not read this file.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE THRESHOLD IS ON *VISIBLE* TIME, AND WHY IT EXCLUDES RATHER THAN INCLUDES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `visibleMs` (src/utils/activityDuration.ts) is wall clock MINUS every stretch
 * the document was hidden. An activity that was opened and immediately buried
 * under a tab switch never got looked at, and recording that as "the learner
 * left it" would be a claim about a person who never saw the thing.
 *
 * The threshold is deliberately a FILTER THAT UNDER-COUNTS. A missed
 * abandonment is a gap in the data; a fabricated one is a false statement about
 * a learner, and false statements are what make a dataset stop being usable.
 * Under-counting is the cheaper error and it is the one we take.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURE — no React, no DOM, no Supabase
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The DOM half is `src/hooks/useAbandonmentBeacon.ts`; the write is
 * `src/services/progress.service.ts`. Every rule above is unit-testable with
 * fixed inputs, which is the whole reason the decision lives in a function
 * instead of inside an event handler.
 */
import type { DurationSample } from '@/utils/activityDuration';

/**
 * Minimum VISIBLE dwell before leaving an activity counts as abandoning it.
 *
 * Three seconds is long enough to exclude the accidental open (a mis-click, a
 * "wrong lesson" bounce, a resume that landed somewhere the learner did not
 * want) and short enough that genuinely reading a question and giving up still
 * lands well inside it — the fastest real read of the shortest activity in the
 * catalogue is several seconds.
 *
 * It is a CLIENT policy on purpose, exactly like `MAX_TRACE_ACTIONS`: there is
 * no threshold in the database, so raising or lowering it later needs no
 * migration and does not invalidate rows already collected. The dwell itself is
 * stored on every abandoned row (`elapsed_ms` / `visible_ms` in the terminal
 * action's payload), so a later analysis can apply a DIFFERENT threshold
 * retroactively to everything above this one. Choosing a low-ish floor is
 * therefore the reversible direction.
 */
export const MIN_ABANDONMENT_VISIBLE_MS = 3_000;

/**
 * WHY the surface went away. Verbatim into the terminal action's payload.
 *
 * Closed at write time (a new reason has to declare itself here) and open at
 * read time (the column and the payload carry no constraint), the same
 * asymmetry the action vocabulary uses.
 */
export const ABANDONMENT_REASONS = [
  /**
   * The activity's render surface went away while the document was still
   * alive: the learner closed the lesson, navigated within the app, or stepped
   * to a different activity without settling this one. The RELIABLE case — a
   * normal async write can complete.
   */
  'left_activity',
  /**
   * The page itself is going away (`pagehide`). May be a real teardown or a
   * bfcache freeze; either way an async write cannot be trusted to finish, so
   * this reason takes the durable-outbox path exclusively. See
   * `useAbandonmentBeacon`.
   */
  'page_teardown',
] as const;

export type AbandonmentReason = (typeof ABANDONMENT_REASONS)[number];

/**
 * Why an abandonment was or was not recorded. A VERDICT rather than a boolean,
 * so that a test — and a future counter — can distinguish the reasons, and so
 * that "we decided not to" is never indistinguishable from "we forgot to".
 */
export type AbandonmentVerdict =
  /** Record it. */
  | 'record'
  /** No origin: the activity never actually opened for this learner. */
  | 'not_opened'
  /** The learner settled an answer — this is an attempt, not an abandonment. */
  | 'settled'
  /** Already recorded for this exact origin. The idempotency guard. */
  | 'already_recorded'
  /** Re-reading something already completed. Leaving a review is not leaving an attempt. */
  | 'reviewing'
  /** Below `MIN_ABANDONMENT_VISIBLE_MS` of visible dwell. */
  | 'too_brief';

/**
 * THE DECISION. Total, pure, and ordered so that the strongest disqualifier
 * wins — `settled` outranks `too_brief`, because a fast correct answer must
 * never be reported as anything other than an answer.
 */
export function abandonmentVerdict({
  startedAt,
  duration,
  settled,
  alreadyRecorded,
  reviewing,
}: {
  /** The trace origin: when the activity opened for this learner. */
  startedAt: number | null;
  /** The dwell as measured by `useActivityDuration`, or null if unmeasured. */
  duration: DurationSample | null;
  /** Did the learner settle an answer on THIS origin? */
  settled: boolean;
  /** Has an abandonment already been recorded for THIS origin? */
  alreadyRecorded: boolean;
  /** Is the learner re-reading an activity they had already completed? */
  reviewing: boolean;
}): AbandonmentVerdict {
  if (settled) return 'settled';
  if (alreadyRecorded) return 'already_recorded';
  if (startedAt === null || !Number.isFinite(startedAt)) return 'not_opened';
  if (reviewing) return 'reviewing';
  // No measurement at all ⇒ we cannot assert the learner dwelt on it, and the
  // filter under-counts by design. `duration` is null exactly when the origin
  // was never armed, which the `not_opened` branch above usually catches first;
  // this is the belt to that suspenders.
  if (!duration) return 'too_brief';
  if (duration.visibleMs < MIN_ABANDONMENT_VISIBLE_MS) return 'too_brief';
  return 'record';
}

/**
 * The stable identity of ONE attempt-in-progress: the activity plus the instant
 * it opened.
 *
 * This is the key every idempotency guard in the beacon is keyed on, and it is
 * deliberately the SAME pair the database deduplicates on
 * (`uq_activity_traces_attempt` is `(user_id, activity_id, started_at)`, and
 * `started_at` for an abandonment IS this origin). One identity, enforced in
 * three places — in-process, in the outbox, and in the unique index — so that a
 * beacon firing twice cannot become two rows at any layer.
 */
export function attemptOriginKey(activityId: string, startedAt: number): string {
  return `${activityId}@${startedAt}`;
}
