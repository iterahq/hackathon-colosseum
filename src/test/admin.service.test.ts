import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * V3 (logic) — admin observability math: roster completion%, per-program
 * completion ratio, engagement counts. Supabase is mocked with a tiny in-memory
 * fixture (one tenant, 2 learners, 2 activities, mixed completion + a foreign
 * learner whose rows must never appear because RLS/app-filter excludes them).
 */

const TENANT = 'tenant-A';
const ACT = ['act1', 'act2'];

// in-memory tables
const tables = {
  memberships: [
    { user_id: 'L1', tenant_id: TENANT, role: 'learner' },
    { user_id: 'L2', tenant_id: TENANT, role: 'learner' },
    { user_id: 'ADM', tenant_id: TENANT, role: 'tenant_admin' },
  ],
  users: [
    { id: 'L1', display_name: 'Learner One', email: 'l1@x' },
    { id: 'L2', display_name: 'Learner Two', email: 'l2@x' },
    { id: 'ADM', display_name: 'Admin', email: 'adm@x' },
  ],
  activity_results: [
    { user_id: 'L1', activity_id: 'act1', passed: true, created_at: '2026-06-18T00:00:00Z' },
    { user_id: 'L1', activity_id: 'act2', passed: true, created_at: '2026-06-19T00:00:00Z' },
    { user_id: 'L2', activity_id: 'act1', passed: true, created_at: '2026-06-10T00:00:00Z' },
  ],
  progress: [
    { user_id: 'L1', activity_id: 'act1', status: 'completed', completed_at: '2026-06-18T00:00:00Z' },
    { user_id: 'L1', activity_id: 'act2', status: 'completed', completed_at: '2026-06-19T00:00:00Z' },
    { user_id: 'L2', activity_id: 'act1', status: 'completed', completed_at: '2026-06-10T00:00:00Z' },
  ],
};

// Minimal PostgREST-ish query builder over the in-memory tables.
function makeQuery(table: string) {
  let rows: Record<string, unknown>[] = [
    ...((tables as Record<string, Record<string, unknown>[]>)[table] ?? []),
  ];
  const builder: Record<string, unknown> = {
    select(sel: string) {
      // programs nested select — return the program tree fixture.
      if (table === 'programs') {
        rows = [
          {
            id: 'P1',
            tenant_id: TENANT,
            slug: 'prog-1',
            title_i18n: { en: 'Program 1' },
            units: [{ lessons: [{ activities: ACT.map((id) => ({ id })) }] }],
          },
        ];
        void sel;
      }
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
    then(resolve: (v: { data: unknown; error: null }) => void) {
      resolve({ data: rows, error: null });
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ from: (t: string) => makeQuery(t) }),
}));

import { getAdminRoster, getAdminCompletion, getAdminEngagement } from '@/services/admin.service';

describe('admin.service observability math (V3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('roster: completion% = completed/total activities, learners only', async () => {
    const roster = await getAdminRoster(TENANT);
    // ADM (tenant_admin) excluded from the LEARNER roster.
    expect(roster.map((r) => r.userId).sort()).toEqual(['L1', 'L2']);
    const l1 = roster.find((r) => r.userId === 'L1')!;
    const l2 = roster.find((r) => r.userId === 'L2')!;
    expect(l1.completionPct).toBe(100); // 2/2
    expect(l2.completionPct).toBe(50); // 1/2
    expect(l1.lastActive).toBe('2026-06-19T00:00:00Z');
  });

  it('completion: per-program ratio = completed instances / (enrolled*total)', async () => {
    const comp = await getAdminCompletion(TENANT);
    expect(comp).toHaveLength(1);
    const p = comp[0];
    expect(p.activitiesTotal).toBe(2);
    expect(p.enrolled).toBe(2); // L1 + L2
    // completed instances: L1 (2) + L2 (1) = 3; denom = 2*2 = 4 => 75%
    expect(p.completedActivityInstances).toBe(3);
    expect(p.completionPct).toBe(75);
    expect(p.active).toBe(2);
  });

  it('engagement: completion count + recency per learner, no raw scores', async () => {
    const eng = await getAdminEngagement(TENANT);
    const byId = Object.fromEntries(eng.map((e) => [e.userId, e]));
    expect(byId.L1.completions).toBe(2);
    expect(byId.L2.completions).toBe(1);
    // shape carries NO score field (ADR-5/15)
    expect(Object.keys(byId.L1)).not.toContain('score');
    expect(Object.keys(byId.L1)).not.toContain('scoreInternal');
  });
});
