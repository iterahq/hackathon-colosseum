import { describe, it, expect } from 'vitest';
import { buildClassReport } from './buildClassReport';
import type { ClassReportData } from '@/types/liveClass';

const users = [
  { userId: 'u1', name: 'Ana', avatarUrl: null },
  { userId: 'u2', name: 'Bia', avatarUrl: 'a.png' },
  { userId: 'u3', name: 'Caio', avatarUrl: null },
];

const data: ClassReportData = {
  users,
  attendance: [
    { userId: 'u1', joinedAt: '2026-07-21T10:00:00Z' },
    { userId: 'u2', joinedAt: '2026-07-21T10:01:00Z' },
    { userId: 'u3', joinedAt: '2026-07-21T10:02:00Z' },
  ],
  answers: [
    { activityId: 'a1', userId: 'u1', correct: true, elapsedMs: 5000, createdAt: '' },
    { activityId: 'a1', userId: 'u2', correct: false, elapsedMs: 9000, createdAt: '' },
    { activityId: 'a2', userId: 'u1', correct: true, elapsedMs: 4000, createdAt: '' },
    { activityId: 'a2', userId: 'u2', correct: true, elapsedMs: 3000, createdAt: '' },
  ],
};

describe('buildClassReport', () => {
  it('ranks by correct count, then engagement, then time', () => {
    const r = buildClassReport(data, ['a1', 'a2']);
    expect(r.participants.map((p) => p.userId)).toEqual(['u1', 'u2', 'u3']);
    expect(r.participants[0]).toMatchObject({ correctCount: 2, answeredCount: 2, totalMs: 9000 });
    expect(r.participants[2]).toMatchObject({ correctCount: 0, answeredCount: 0, totalMs: 0 });
  });

  it('breaks a correct-count tie by total time', () => {
    const tied: ClassReportData = {
      users,
      attendance: [],
      answers: [
        { activityId: 'a1', userId: 'u1', correct: true, elapsedMs: 9000, createdAt: '' },
        { activityId: 'a1', userId: 'u2', correct: true, elapsedMs: 2000, createdAt: '' },
      ],
    };
    expect(buildClassReport(tied, ['a1']).participants.map((p) => p.userId)).toEqual(['u2', 'u1']);
  });

  it('computes per-activity correct/wrong/unanswered against the participant set', () => {
    const r = buildClassReport(data, ['a1', 'a2', 'a3']);
    expect(r.perActivity).toEqual([
      { activityId: 'a1', correct: 1, wrong: 1, unanswered: 1 },
      { activityId: 'a2', correct: 2, wrong: 0, unanswered: 1 },
      { activityId: 'a3', correct: 0, wrong: 0, unanswered: 3 },
    ]);
  });

  it('computes totals and includes answerers missing from attendance', () => {
    const r = buildClassReport({ ...data, attendance: [] }, ['a1', 'a2']);
    // `guests: 0` — this fixture has no class_guests rows, so every participant
    // counts, exactly as before guests existed.
    expect(r.totals).toEqual({ participants: 2, answers: 4, correctPct: 75, guests: 0 });
    expect(r.participants.every((p) => p.joinedAt === null)).toBe(true);
  });

  it('falls back to a short id when the user row is not visible', () => {
    const r = buildClassReport(
      { users: [], attendance: [], answers: [{ activityId: 'a1', userId: 'u-hidden-123', correct: true, elapsedMs: null, createdAt: '' }] },
      ['a1']
    );
    expect(r.participants[0].name).toBe('u-hidden');
    expect(r.participants[0].totalMs).toBe(0);
  });
});
