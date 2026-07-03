import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * loop-1 fixes for the live-class data layer:
 *  - fix #1b — startClassSession defaults the pointer server-side (getFirstActivityId)
 *    when the caller passes a null firstActivityId (the start-race), so a started
 *    session is NEVER inserted with current_activity_id=null.
 *  - fix #2  — getClassActivityCompleters scopes the roster + denominator to the
 *    live presence roster (present learners only) and never leaks absent names.
 *
 * A tiny in-memory PostgREST-ish builder mirrors the admin.service.test fixture
 * style, extended with .insert() capture + activities/users/progress tables.
 */

const LESSON = 'lesson-1';
const ACT_1 = 'act-1'; // ordinal 0 → the expected default pointer
const ACT_2 = 'act-2'; // ordinal 1
const TENANT = 'tenant-dfl';
const ACTIVITY = 'act-current';

// present learners (in the room)
const L_PRESENT_DONE = 'learner-present-done';
const L_PRESENT_NOT = 'learner-present-not';
// absent learner (must NEVER appear / count when scoped to presence)
const L_ABSENT = 'learner-absent';

let insertedSession: Record<string, unknown> | null = null;

function makeBuilder(table: string) {
  let rows: Record<string, unknown>[] = [];
  if (table === 'activities') {
    // deliberately out of order to prove ordering by ordinal.
    rows = [
      { id: ACT_2, ordinal: 1, lesson_id: LESSON },
      { id: ACT_1, ordinal: 0, lesson_id: LESSON },
    ];
  }
  if (table === 'memberships') {
    rows = [
      { user_id: L_PRESENT_DONE, role: 'learner', tenant_id: TENANT },
      { user_id: L_PRESENT_NOT, role: 'learner', tenant_id: TENANT },
      { user_id: L_ABSENT, role: 'learner', tenant_id: TENANT },
      { user_id: 'some-instructor', role: 'instructor', tenant_id: TENANT },
    ];
  }
  if (table === 'users') {
    rows = [
      { id: L_PRESENT_DONE, display_name: 'Present Done', email: 'pd@x.com' },
      { id: L_PRESENT_NOT, display_name: 'Present NotDone', email: 'pn@x.com' },
      { id: L_ABSENT, display_name: 'Absent Person', email: 'ab@x.com' },
    ];
  }
  if (table === 'progress') {
    rows = [{ user_id: L_PRESENT_DONE, status: 'completed', activity_id: ACTIVITY }];
  }
  if (table === 'activity_results') {
    rows = [];
  }

  let orderCol: string | null = null;
  const builder: Record<string, unknown> = {
    select() {
      return builder;
    },
    insert(payload: Record<string, unknown>) {
      insertedSession = { ...payload, id: 'new-session', created_at: '2026-07-03T00:00:00Z' };
      return builder;
    },
    eq(col: string, val: unknown) {
      rows = rows.filter((r) => r[col] === val);
      return builder;
    },
    in(col: string, vals: unknown[]) {
      rows = rows.filter((r) => vals.includes(r[col]));
      return builder;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      orderCol = col;
      const asc = opts?.ascending !== false;
      rows = [...rows].sort((a, b) => {
        const av = a[orderCol as string] as number;
        const bv = b[orderCol as string] as number;
        return asc ? Number(av) - Number(bv) : Number(bv) - Number(av);
      });
      return builder;
    },
    limit(n: number) {
      rows = rows.slice(0, n);
      return Promise.resolve({ data: rows, error: null });
    },
    single() {
      // used by insert().select().single()
      return Promise.resolve({ data: insertedSession, error: null });
    },
    maybeSingle() {
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    then(resolve: (v: { data: unknown; error: null }) => void) {
      resolve({ data: rows, error: null });
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ from: (table: string) => makeBuilder(table) }),
}));

import {
  getFirstActivityId,
  startClassSession,
  getClassActivityCompleters,
} from '@/services/liveClass.service';

beforeEach(() => {
  insertedSession = null;
});

describe('getFirstActivityId (fix #1b)', () => {
  it('returns the lesson activity with the lowest ordinal', async () => {
    expect(await getFirstActivityId(LESSON)).toBe(ACT_1);
  });

  it('returns null for an empty lessonId', async () => {
    expect(await getFirstActivityId('')).toBeNull();
  });
});

describe('startClassSession pointer default (fix #1 — start race)', () => {
  it('defaults current_activity_id to the first activity when firstActivityId is null', async () => {
    await startClassSession({
      tenantId: TENANT,
      lessonId: LESSON,
      instructorId: 'instr',
      firstActivityId: null,
    });
    expect(insertedSession).not.toBeNull();
    expect(insertedSession?.current_activity_id).toBe(ACT_1);
  });

  it('honors an explicit firstActivityId when provided (no server lookup override)', async () => {
    await startClassSession({
      tenantId: TENANT,
      lessonId: LESSON,
      instructorId: 'instr',
      firstActivityId: ACT_2,
    });
    expect(insertedSession?.current_activity_id).toBe(ACT_2);
  });
});

describe('getClassActivityCompleters presence scoping (fix #2)', () => {
  it('counts + names ONLY present learners when presentUserIds is provided', async () => {
    const res = await getClassActivityCompleters(TENANT, ACTIVITY, [
      L_PRESENT_DONE,
      L_PRESENT_NOT,
    ]);
    const ids = res.map((r) => r.userId);
    expect(ids).toContain(L_PRESENT_DONE);
    expect(ids).toContain(L_PRESENT_NOT);
    // The absent learner is NOT counted and NOT leaked.
    expect(ids).not.toContain(L_ABSENT);
    expect(res).toHaveLength(2);
    expect(res.find((r) => r.userId === L_PRESENT_DONE)?.done).toBe(true);
    expect(res.find((r) => r.userId === L_PRESENT_NOT)?.done).toBe(false);
  });

  it('falls back to the full tenant learner set when no roster is given', async () => {
    const res = await getClassActivityCompleters(TENANT, ACTIVITY);
    expect(res).toHaveLength(3); // all three learners, absent included
  });
});
