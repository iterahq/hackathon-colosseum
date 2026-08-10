import type { ClassPresenceMember, ClassRanking } from '@/types/liveClass';

// Score-first: correct answers decide the order; total time only breaks ties.
export function rankByScore(
  roster: ClassPresenceMember[],
  elapsed: Record<string, Record<string, number>>,
  answers?: Record<string, Record<string, boolean>>
): ClassRanking {
  const activityIds = new Set<string>([...Object.keys(elapsed), ...Object.keys(answers ?? {})]);

  const entries = roster
    .filter((m) => !m.isInstructor)
    .map(({ userId, name, avatarUrl, isGuest }) => {
      let totalMs = 0;
      let answeredCount = 0;
      let correctCount = 0;
      for (const activityId of activityIds) {
        const ms = elapsed[activityId]?.[userId];
        if (typeof ms === 'number') totalMs += ms;
        const answer = answers?.[activityId]?.[userId];
        if (typeof answer === 'boolean') {
          answeredCount += 1;
          if (answer) correctCount += 1;
        }
      }
      // `isGuest` rides all the way to the podium: a guest CAN out-rank a real
      // student (ADR-9 accepts that), so the badge has to survive ranking.
      return {
        userId,
        name,
        avatarUrl,
        totalMs,
        answeredCount,
        correctCount,
        isGuest,
      };
    });

  const ranked = entries
    .filter((e) => e.answeredCount > 0)
    .sort(
      (a, b) =>
        b.correctCount - a.correctCount || a.totalMs - b.totalMs || a.name.localeCompare(b.name)
    )
    .map((e, i) => ({
      userId: e.userId,
      name: e.name,
      avatarUrl: e.avatarUrl,
      totalMs: e.totalMs,
      answeredCount: e.answeredCount,
      correctCount: e.correctCount,
      rank: i + 1,
      isGuest: e.isGuest,
    }));

  const waiting = entries
    .filter((e) => e.answeredCount === 0)
    .map(({ userId, name, avatarUrl, isGuest }) => ({ userId, name, avatarUrl, isGuest }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ranked, waiting };
}
