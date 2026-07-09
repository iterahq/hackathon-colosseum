import type { ClassPresenceMember, ClassRanking } from '@/types/liveClass';

/**
 * Rank the PRESENT learners by how fast they answered — cumulative answer time
 * across the activities each one has answered so far (fastest total first).
 * Timing comes from the ephemeral broadcast `elapsed` map; correctness from
 * `answers` is informational (shown, not the sort key). Learners with no timing
 * yet are returned separately as `waiting` so the professor sees who's missing.
 */
export function rankByTiming(
  roster: ClassPresenceMember[],
  elapsed: Record<string, Record<string, number>>,
  answers?: Record<string, Record<string, boolean>>
): ClassRanking {
  const activityIds = new Set<string>([...Object.keys(elapsed), ...Object.keys(answers ?? {})]);

  const entries = roster
    .filter((m) => !m.isInstructor)
    .map(({ userId, name, avatarUrl }) => {
      let totalMs = 0;
      let timedCount = 0;
      let answeredCount = 0;
      let correctCount = 0;
      for (const activityId of activityIds) {
        const ms = elapsed[activityId]?.[userId];
        if (typeof ms === 'number') {
          totalMs += ms;
          timedCount += 1;
        }
        const answer = answers?.[activityId]?.[userId];
        if (typeof answer === 'boolean') {
          answeredCount += 1;
          if (answer) correctCount += 1;
        }
      }
      return { userId, name, avatarUrl, totalMs, timedCount, answeredCount, correctCount };
    });

  const ranked = entries
    .filter((e) => e.timedCount > 0)
    .sort(
      (a, b) =>
        a.totalMs - b.totalMs ||
        b.answeredCount - a.answeredCount ||
        a.name.localeCompare(b.name)
    )
    .map((e, i) => ({
      userId: e.userId,
      name: e.name,
      avatarUrl: e.avatarUrl,
      totalMs: e.totalMs,
      answeredCount: e.answeredCount,
      correctCount: e.correctCount,
      rank: i + 1,
    }));

  const waiting = entries
    .filter((e) => e.timedCount === 0)
    .map(({ userId, name, avatarUrl }) => ({ userId, name, avatarUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ranked, waiting };
}
