import type { ClassReport, ClassReportData, ClassReportParticipant } from '@/types/liveClass';

/**
 * Aggregate the durable per-session rows (class_answers + class_attendance)
 * into the instructor's post-class report. Pure — all report logic lives here
 * (dfl-db-simplicity: thin tables, aggregation in TS).
 */
export function buildClassReport(data: ClassReportData, activityIds: string[]): ClassReport {
  const users = new Map(data.users.map((u) => [u.userId, u]));
  const joined = new Map(data.attendance.map((a) => [a.userId, a.joinedAt]));

  const byUser = new Map<string, ClassReportParticipant>();
  const ensure = (userId: string): ClassReportParticipant => {
    let p = byUser.get(userId);
    if (!p) {
      const u = users.get(userId);
      p = {
        userId,
        name: u?.name ?? userId.slice(0, 8),
        avatarUrl: u?.avatarUrl ?? null,
        joinedAt: joined.get(userId) ?? null,
        answeredCount: 0,
        correctCount: 0,
        totalMs: 0,
      };
      byUser.set(userId, p);
    }
    return p;
  };

  for (const a of data.attendance) ensure(a.userId);
  for (const a of data.answers) {
    const p = ensure(a.userId);
    p.answeredCount += 1;
    if (a.correct) p.correctCount += 1;
    p.totalMs += a.elapsedMs ?? 0;
  }

  // Podium order: most correct first, then most engaged, then fastest, then name.
  const participants = [...byUser.values()].sort(
    (x, y) =>
      y.correctCount - x.correctCount ||
      y.answeredCount - x.answeredCount ||
      x.totalMs - y.totalMs ||
      x.name.localeCompare(y.name)
  );

  const perActivity = activityIds.map((activityId) => {
    const rows = data.answers.filter((a) => a.activityId === activityId);
    const correct = rows.filter((r) => r.correct).length;
    return {
      activityId,
      correct,
      wrong: rows.length - correct,
      unanswered: Math.max(participants.length - rows.length, 0),
    };
  });

  const answers = data.answers.length;
  const correctTotal = data.answers.filter((a) => a.correct).length;
  return {
    participants,
    perActivity,
    totals: {
      participants: participants.length,
      answers,
      correctPct: answers ? Math.round((correctTotal / answers) * 100) : 0,
    },
  };
}
