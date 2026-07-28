import { describe, it, expect } from 'vitest';
import { buildClassReport } from '@/utils/buildClassReport';
import type { ClassReportData } from '@/types/liveClass';

/**
 * ADR-4 — a link-invited guest is LISTED in the class report but never COUNTED
 * in it.
 *
 * The guard matters because of a defect found the same day: `persistActivityProgress`
 * was only recording CORRECT answers, so the product's pass rate was structurally
 * 100%. Folding sales-demo visitors into `correctPct` is the same species of bug —
 * a number that looks measured but is partly staged — and it lands on exactly the
 * figures that were just repaired.
 */

const A1 = 'act-1';
const A2 = 'act-2';

/** Two real students and one guest, all present; the guest answers perfectly. */
function data(): ClassReportData {
  return {
    users: [
      { userId: 'u1', name: 'Ana', avatarUrl: null },
      { userId: 'u2', name: 'Bruno', avatarUrl: null },
      { userId: 'g1', name: 'Investidor', avatarUrl: null },
    ],
    attendance: [
      { userId: 'u1', joinedAt: '2026-07-28T10:00:00Z' },
      { userId: 'u2', joinedAt: '2026-07-28T10:00:01Z' },
      { userId: 'g1', joinedAt: '2026-07-28T10:00:02Z' },
    ],
    answers: [
      { activityId: A1, userId: 'u1', correct: true, elapsedMs: 5000, createdAt: 'x' },
      { activityId: A1, userId: 'u2', correct: false, elapsedMs: 9000, createdAt: 'x' },
      { activityId: A1, userId: 'g1', correct: true, elapsedMs: 1000, createdAt: 'x' },
      { activityId: A2, userId: 'g1', correct: true, elapsedMs: 1000, createdAt: 'x' },
    ],
    guestUserIds: ['g1'],
  };
}

describe('buildClassReport — guests are listed but not counted', () => {
  it('keeps guests OUT of every cohort total', () => {
    const r = buildClassReport(data(), [A1, A2]);
    // 3 people were in the room; 2 belong to the cohort.
    expect(r.totals.participants).toBe(2);
    // 4 answers were given; 2 came from the cohort.
    expect(r.totals.answers).toBe(2);
    // Cohort got 1 of 2 right => 50%. Counting the guest would inflate this to 75%.
    expect(r.totals.correctPct).toBe(50);
    expect(r.totals.guests).toBe(1);
  });

  it('still LISTS the guest, flagged, so the professor can see who visited', () => {
    const r = buildClassReport(data(), [A1, A2]);
    const guest = r.participants.find((p) => p.userId === 'g1');
    expect(guest).toBeDefined();
    expect(guest?.isGuest).toBe(true);
    expect(r.participants).toHaveLength(3);
    // ADR-9: a guest may out-rank the cohort; the badge, not exclusion, is what distinguishes them.
    expect(r.participants[0].userId).toBe('g1');
  });

  it('does not let a guest answer distort per-activity stats', () => {
    const r = buildClassReport(data(), [A1, A2]);
    const a1 = r.perActivity.find((p) => p.activityId === A1)!;
    expect(a1).toMatchObject({ correct: 1, wrong: 1, unanswered: 0 });
    // A2 was answered ONLY by the guest -> for the cohort it is fully unanswered.
    const a2 = r.perActivity.find((p) => p.activityId === A2)!;
    expect(a2).toMatchObject({ correct: 0, wrong: 0, unanswered: 2 });
  });

  it('marks real students as non-guests', () => {
    const r = buildClassReport(data(), [A1, A2]);
    expect(r.participants.find((p) => p.userId === 'u1')?.isGuest).toBe(false);
  });

  it('counts everyone when the guest schema is not applied (guestUserIds absent)', () => {
    const d = data();
    delete (d as { guestUserIds?: string[] }).guestUserIds;
    const r = buildClassReport(d, [A1, A2]);
    // Degrades to the pre-0026 behaviour rather than silently dropping people.
    expect(r.totals.participants).toBe(3);
    expect(r.totals.guests).toBe(0);
  });

  it('reports zero guests for an ordinary class', () => {
    const d = data();
    d.guestUserIds = [];
    const r = buildClassReport(d, [A1, A2]);
    expect(r.totals.guests).toBe(0);
    expect(r.totals.participants).toBe(3);
  });
});
