import type { ClassPresenceMember, ClassRanking } from '@/types/liveClass';

// Score-first: points decide the order; total time only breaks ties.
// A point is a correct answer OR a star from the professor, so the star is a
// real reward and not a badge — but the two stay separate on the entry, because
// the class has to be able to tell an earned point from a given one.
export function rankByScore(
  roster: ClassPresenceMember[],
  elapsed: Record<string, Record<string, number>>,
  answers?: Record<string, Record<string, boolean>>,
  stars?: Record<string, number>
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
        stars: Math.max(0, stars?.[userId] ?? 0),
        isGuest,
      };
    });

  // Starring someone who hasn't answered yet is the common case — it is how the
  // professor rewards a good question. Ranking only on `answeredCount` would
  // drop that star into the "aguardando" list and it would look like nothing
  // happened.
  const ranked = entries
    .filter((e) => e.answeredCount > 0 || e.stars > 0)
    .sort(
      (a, b) =>
        b.correctCount + b.stars - (a.correctCount + a.stars) ||
        // Quem só tem estrela tem totalMs 0, que como desempate valeria "mais
        // rápido da turma" — vai para o fim do empate, não para a frente.
        (a.answeredCount === 0 ? Number.MAX_SAFE_INTEGER : a.totalMs) -
          (b.answeredCount === 0 ? Number.MAX_SAFE_INTEGER : b.totalMs) ||
        a.name.localeCompare(b.name)
    )
    .map((e, i) => ({
      userId: e.userId,
      name: e.name,
      avatarUrl: e.avatarUrl,
      totalMs: e.totalMs,
      answeredCount: e.answeredCount,
      correctCount: e.correctCount,
      stars: e.stars,
      rank: i + 1,
      isGuest: e.isGuest,
    }));

  const waiting = entries
    .filter((e) => e.answeredCount === 0 && e.stars === 0)
    .map(({ userId, name, avatarUrl, isGuest }) => ({ userId, name, avatarUrl, isGuest }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ranked, waiting };
}
