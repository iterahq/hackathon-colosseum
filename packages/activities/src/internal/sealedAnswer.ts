import type { JudgeOutcome } from '../components/hostLessonRules.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';

/** One field of the answer key a passing verdict brought; `undefined` before it. */
export function sealedKey<T>(outcome: JudgeOutcome | null, field: string): T | undefined {
  return outcome?.key ? (outcome.key[field] as T | undefined) : undefined;
}

/**
 * The verdict of a sealed activity shown again without a new submission: the
 * one the host kept with the replayed answer, and a pass when it kept none (a
 * finished activity is one the host's judge passed).
 */
export function restoredVerdict(activity: PortableActivity, priorAnswer: ActivityCompletion | undefined): boolean {
  const kept = (priorAnswer as { correct?: unknown } | undefined)?.correct;
  return typeof kept === 'boolean' ? kept : activity.status === 'done';
}
