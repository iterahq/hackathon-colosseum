import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression test for THE value-blocker: completing a lesson did not "stick".
 *
 * Root cause: getProgramBySlug returned the program tree with NO per-activity
 * progress status (activity.status undefined), while the SkillTree unlock gate
 * checks `status === 'done'`. So a fully-completed lesson read as not-done →
 * program stuck at 0/N → the next lesson stayed LOCKED. Compounded by an enum
 * mismatch (DB 'completed' vs UI 'done').
 *
 * This test mocks the Itera Supabase surface: the program tree query returns two
 * lessons (5 + 3 activities), and the `progress` table has all 5 of lesson 1's
 * activities at DB status 'completed'. We assert getProgramBySlug stamps the
 * UI-normalized 'done' onto exactly those activities, which is what makes the
 * SkillTree mark lesson 1 done and unlock lesson 2.
 */

// Lesson 1: activities a1..a5 (all completed in DB). Lesson 2: b1..b3 (none).
const L1 = ['a1', 'a2', 'a3', 'a4', 'a5'];
const L2 = ['b1', 'b2', 'b3'];

const programRow = {
  id: 'p1',
  tenant_id: 't-itera',
  slug: 'modele-dados-com-ia',
  title_i18n: { pt: 'Modele', en: 'Model' },
  created_at: '2026-06-01T00:00:00Z',
  units: [
    {
      id: 'u1',
      program_id: 'p1',
      ordinal: 1,
      title_i18n: { pt: 'U1' },
      lessons: [
        {
          id: 'l1',
          unit_id: 'u1',
          ordinal: 1,
          title_i18n: { pt: 'Pulses' },
          activities: L1.map((id, i) => ({
            id,
            lesson_id: 'l1',
            ordinal: i + 1,
            kind: 'document',
            spec: {},
            rubric: null,
          })),
        },
        {
          id: 'l2',
          unit_id: 'u1',
          ordinal: 2,
          title_i18n: { pt: 'Commit + Badge' },
          activities: L2.map((id, i) => ({
            id,
            lesson_id: 'l2',
            ordinal: i + 1,
            kind: 'code',
            spec: {},
            rubric: null,
          })),
        },
      ],
    },
  ],
};

// itera.progress rows — lesson 1 fully completed (DB enum 'completed') by the
// caller; staff RLS also returns another member who finished lesson 2.
const progressRows = [
  ...L1.map((id) => ({ user_id: 'me', activity_id: id, status: 'completed' })),
  ...L2.map((id) => ({ user_id: 'other', activity_id: id, status: 'completed' })),
];

function makeFrom(table: string) {
  if (table === 'programs') {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      order: () => b,
      maybeSingle: async () => ({ data: programRow, error: null }),
    };
    return b;
  }
  if (table === 'progress') {
    let rows = progressRows;
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col as keyof (typeof rows)[number]] === val);
        return b;
      },
      in: async () => ({ data: rows, error: null }),
    };
    return b;
  }
  return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
}

vi.mock('@/services/iteraUser', () => ({ getIteraUserId: async () => 'me' }));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ from: (t: string) => makeFrom(t) }),
}));

import { getProgramBySlug, getLessonProgress } from '@/services/programs.service';

describe('getProgramBySlug — derives per-activity progress (unlock gate)', () => {
  beforeEach(() => vi.clearAllMocks());

  it("stamps lesson 1's completed activities with UI 'done' (not raw 'completed')", async () => {
    const program = await getProgramBySlug('modele-dados-com-ia');
    const l1 = program.units[0].lessons![0];
    expect(l1.activities).toHaveLength(5);
    for (const a of l1.activities!) {
      expect(a.status).toBe('done');
      expect(a.status).not.toBe('completed');
    }
  });

  it("leaves lesson 2 activities without a done status (stays locked-able), even when another member finished them", async () => {
    const program = await getProgramBySlug('modele-dados-com-ia');
    const l2 = program.units[0].lessons![1];
    for (const a of l2.activities!) {
      expect(a.status).not.toBe('done');
    }
  });

  it('makes lesson 1 read as fully done → lesson 2 unlocks (the value-blocker)', async () => {
    const program = await getProgramBySlug('modele-dados-com-ia');
    const lessons = program.units[0].lessons!;
    const lessonDone = (l: typeof lessons[number]) =>
      (l.activities ?? []).length > 0 && (l.activities ?? []).every((a) => a.status === 'done');
    expect(lessonDone(lessons[0])).toBe(true); // lesson 1 done
    expect(lessonDone(lessons[1])).toBe(false); // lesson 2 becomes the new 'current'
  });
});

describe('getLessonProgress — normalizes DB enum to UI value', () => {
  it("returns 'done' for DB 'completed'", async () => {
    const map = await getLessonProgress(L1);
    expect(map.a1).toBe('done');
    expect(Object.values(map).every((v) => (v as string) !== 'completed')).toBe(true);
  });
});
