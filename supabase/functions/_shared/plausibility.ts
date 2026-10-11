/**
 * The plausibility floor of a completed lesson (security review, finding 1).
 * Progress is written by the browser, so this proves nothing about learning:
 * it only refuses the cheapest fabrication, a whole day "completed" in one
 * burst of requests. All constants are deliberately conservative.
 */

/** A lesson of `FULL_FLOOR_ACTIVITIES` or more cannot be completed in less than this. */
export const MIN_LESSON_SPAN_MS = 20_000;
export const FULL_FLOOR_ACTIVITIES = 15;
/** Shorter lessons scale down: this much per step between two activities. */
const SPAN_PER_STEP_MS = Math.ceil(MIN_LESSON_SPAN_MS / (FULL_FLOOR_ACTIVITIES - 1));

export type ReviewReason = 'too_fast' | 'missing_results' | 'unverified';

export interface LessonCompletion {
  activityId: string;
  completedAt: string;
  /** The completion was recorded by a client role (migration 0134). False: an operator, or a row older than the guard. */
  writtenByClient: boolean;
  /** The learner has a passed `activity_results` row for the activity. */
  hasPassedResult: boolean;
}

/** The least time between the first and the last completion of a lesson with this many activities. */
export function minLessonSpanMs(activityCount: number): number {
  if (!Number.isFinite(activityCount) || activityCount <= 1) return 0;
  return Math.min(MIN_LESSON_SPAN_MS, (activityCount - 1) * SPAN_PER_STEP_MS);
}

/**
 * Why a fully completed lesson does not count for certification yet; `null`
 * when it counts.
 *
 * - A lesson with no client-recorded completion is not judged (operator
 *   seeding, rows from before the guard).
 * - `too_fast`: the WHOLE lesson's completions (whoever recorded them) span
 *   less than the floor. A learner who finishes the last two activities of a
 *   day started earlier passes: the span is the day's, not the visit's.
 * - `missing_results`: a client-recorded completion has no passed attempt.
 *   The player writes one for every activity it completes.
 */
export function lessonPlausibility(completions: readonly LessonCompletion[]): ReviewReason | null {
  const byClient = completions.filter((completion) => completion.writtenByClient);
  if (byClient.length === 0) return null;
  const times = completions.map((completion) => new Date(completion.completedAt).getTime());
  if (times.some((time) => Number.isNaN(time))) return 'too_fast';
  const span = Math.max(...times) - Math.min(...times);
  if (span < minLessonSpanMs(completions.length)) return 'too_fast';
  if (byClient.some((completion) => !completion.hasPassedResult)) return 'missing_results';
  return null;
}
