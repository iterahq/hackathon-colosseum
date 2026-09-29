import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression test for the getUserStats enum bug.
 *
 * The itera.progress_status enum is ('not_started','in_progress','completed').
 * getUserStats previously filtered progress on status='done' (the player's
 * UI-state literal, NOT a DB value), so completion counts were ALWAYS 0.
 * This fixture stores rows the way the DB does (status='completed') and asserts
 * the query both (a) filters on the correct enum value and (b) returns a
 * non-zero completedActivities count.
 */

// In-memory tables mimicking the itera.* schema PostgREST surface.
const tables: Record<string, Record<string, unknown>[]> = {
  xp_events: [{ amount: 30 }, { amount: 70 }],
  user_badges: [{ badge_id: 'b1' }, { badge_id: 'b2' }, { badge_id: 'b3' }],
  // staff RLS returns other members too: the 'other' row must never be counted
  progress: [
    { user_id: 'me', status: 'completed' },
    { user_id: 'me', status: 'completed' },
    { user_id: 'me', status: 'completed' },
    { user_id: 'me', status: 'in_progress' },
    { user_id: 'me', status: 'not_started' },
    { user_id: 'other', status: 'completed' },
  ],
};

// Capture the status value getUserStats filters progress on.
let progressFilter: { col: string; val: unknown } | null = null;
let progressUser: unknown = null;

function makeQuery(table: string) {
  let rows = [...(tables[table] ?? [])];
  const builder: Record<string, unknown> = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      if (table === 'progress' && col === 'user_id') progressUser = val;
      else if (table === 'progress') progressFilter = { col, val };
      rows = rows.filter((r) => r[col] === val);
      return builder;
    },
    then(resolve: (v: { data: unknown; error: null }) => void) {
      resolve({ data: rows, error: null });
    },
  };
  return builder;
}

vi.mock('@/services/iteraUser', () => ({ getIteraUserId: async () => 'me' }));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ from: (t: string) => makeQuery(t) }),
}));

import { getUserStats } from '@/services/programs.service';

describe('getUserStats (progress enum bug)', () => {
  beforeEach(() => {
    progressFilter = null;
    progressUser = null;
    vi.clearAllMocks();
  });

  it("filters progress on the real enum value 'completed', not 'done'", async () => {
    await getUserStats();
    expect(progressFilter).toEqual({ col: 'status', val: 'completed' });
    expect(progressFilter?.val).not.toBe('done');
  });

  it("counts only the caller's own progress rows", async () => {
    await getUserStats();
    expect(progressUser).toBe('me');
  });

  it('counts completed activities (non-zero) and sums XP', async () => {
    const stats = await getUserStats();
    expect(stats.completedActivities).toBe(3); // 3 rows with status='completed'
    expect(stats.completedActivities).toBeGreaterThan(0);
    expect(stats.totalXp).toBe(100); // 30 + 70
    expect(stats.badgeCount).toBe(3);
  });
});
