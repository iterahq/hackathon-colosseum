import type { ClassPresenceMember } from '@/types/liveClass';

/**
 * Accumulate every learner who was EVER present into a stable map keyed by
 * userId. Presence drains on `leave`, so the live roster shrinks as students
 * disconnect (e.g. right after the class ends). The final podium must not lose
 * someone who already answered but has since left — so we merge each roster
 * snapshot in and never drop a member. The instructor is excluded (never ranked).
 */
export function mergeSeenLearners(
  prev: ReadonlyMap<string, ClassPresenceMember>,
  roster: readonly ClassPresenceMember[],
): Map<string, ClassPresenceMember> {
  const next = new Map(prev);
  for (const m of roster) {
    if (m.isInstructor) continue;
    next.set(m.userId, m);
  }
  return next;
}
