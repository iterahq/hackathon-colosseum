import type { ClassReport, ClassReportData, ClassReportParticipant } from '@/types/liveClass';

/**
 * Aggregate the durable per-session rows (class_answers + class_attendance)
 * into the instructor's post-class report. Pure — all report logic lives here
 * (dfl-db-simplicity: thin tables, aggregation in TS).
 *
 * ── Guests are LISTED but never COUNTED (ADR-4 + ADR-12) ───────────────────
 * A link-invited guest is someone shown the product in a sales conversation.
 * They are a real person in the room, so the professor must see them (ADR-12) —
 * but they are not part of the cohort, so they must not move the cohort's
 * numbers (ADR-4). Those two pull in opposite directions and the split is the
 * whole point of this function:
 *
 *   participants  → EVERYONE, guests flagged `isGuest` so the UI can badge them
 *   totals        → cohort only
 *   perActivity   → cohort only
 *
 * Why this matters more than it looks: on 2026-07-28 it was found that
 * `persistActivityProgress` only ever recorded CORRECT answers, which made the
 * pass rate structurally 100% across the product. Letting demo visitors into
 * `correctPct` is the same family of defect — a number that looks like
 * measurement but is partly theatre — landing on the very figures that were
 * just repaired. Hence: counted separately, never silently.
 */
export function buildClassReport(data: ClassReportData, activityIds: string[]): ClassReport {
  const users = new Map(data.users.map((u) => [u.userId, u]));
  const joined = new Map(data.attendance.map((a) => [a.userId, a.joinedAt]));
  const guestIds = new Set(data.guestUserIds ?? []);

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
        isGuest: guestIds.has(userId),
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
  // Guests are ranked alongside the cohort on purpose — ADR-9 accepts that a
  // guest can out-rank a real student, and the badge is what tells them apart.
  const participants = [...byUser.values()].sort(
    (x, y) =>
      y.correctCount - x.correctCount ||
      y.answeredCount - x.answeredCount ||
      x.totalMs - y.totalMs ||
      x.name.localeCompare(y.name)
  );

  // From here down, everything is COHORT-ONLY.
  const cohort = participants.filter((p) => !p.isGuest);
  const cohortAnswers = data.answers.filter((a) => !guestIds.has(a.userId));

  const perActivity = activityIds.map((activityId) => {
    const rows = cohortAnswers.filter((a) => a.activityId === activityId);
    const correct = rows.filter((r) => r.correct).length;
    return {
      activityId,
      correct,
      wrong: rows.length - correct,
      unanswered: Math.max(cohort.length - rows.length, 0),
    };
  });

  const answers = cohortAnswers.length;
  const correctTotal = cohortAnswers.filter((a) => a.correct).length;
  return {
    participants,
    perActivity,
    totals: {
      participants: cohort.length,
      answers,
      correctPct: answers ? Math.round((correctTotal / answers) * 100) : 0,
      guests: participants.length - cohort.length,
    },
  };
}
