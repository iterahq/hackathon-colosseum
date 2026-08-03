/**
 * Where the self-paced player lands when the learner moves through a lesson by
 * hand — as opposed to `advance()`, which moves forward as a CONSEQUENCE of
 * completing something and writes progress on the way.
 *
 * ── Why the completion screen is a position, not a mode ─────────────────────
 * `completed` used to be a one-way door: once the trophy was on screen there
 * was no state transition back to any activity, so a finished lesson could
 * never be reopened (instructor feedback 2026-08-01).
 */
import type { LessonPosition } from '@/types/content';

/**
 * One step back. From the completion screen that is the LAST activity; from
 * activity 0 it is a no-op (the caller should not offer the affordance — see
 * `canStepBack` — but a no-op is the safe answer if it does).
 */
export function stepBack({ index, completed }: LessonPosition, total: number): LessonPosition {
  if (completed) return { index: Math.max(0, total - 1), completed: false };
  return { index: Math.max(0, index - 1), completed: false };
}

/**
 * One step forward WITHOUT grading. This is the escape hatch for an activity
 * the learner already finished: `answerMachine` locks a `done` activity
 * (`done → locked → !acceptsSubmit`), so someone who stepped back onto it has
 * no submit button to move on with.
 */
export function stepForward({ index }: LessonPosition, total: number): LessonPosition {
  if (index >= total - 1) return { index, completed: true };
  return { index: index + 1, completed: false };
}

/** There is somewhere behind to go to. Empty lessons have no navigation at all. */
export function canStepBack({ index, completed }: LessonPosition, total: number): boolean {
  if (total === 0) return false;
  return completed || index > 0;
}
