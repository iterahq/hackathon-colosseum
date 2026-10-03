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

/**
 * Forward by hand is only free over ground already covered: strictly behind the
 * frontier — the furthest activity the learner reached by answering, hit or
 * miss — and never from the completion screen (there is nothing after it).
 * Once the learner has been through the completion screen (`finished`), the
 * last activity may step on to it again, as the review "Continuar" does.
 */
export function canStepForward(
  { index, completed }: LessonPosition,
  frontier: number,
  finished = false
): boolean {
  return !completed && (index < frontier || finished);
}

/** The "back to where I was" jump — always lands on an activity, never on the trophy. */
export function jumpToFrontier(frontier: number): LessonPosition {
  return { index: frontier, completed: false };
}
