import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression pin for a privilege escalation found end-to-end on 2026-07-28.
 *
 * `getMyMemberships()` used to select from `itera.memberships` with NO
 * `user_id` filter, on the assumption (stated in its own docstring) that RLS
 * returns "own rows only". That assumption is false by design: RLS on
 * memberships lets staff read EVERY membership in their tenant, because the
 * roster surfaces need exactly that.
 *
 * Consequence, reproduced against the real DB: `claude-e2e-prof` (role
 * `instructor`, and nothing else) received the whole tenant's rows — including
 * a colleague's `tenant_admin` row — so `isTenantAdmin()` returned true and
 * `/admin` rendered for an instructor.
 *
 * This spec pins the fix at the data layer: the query must be scoped to the
 * caller's own itera.users id, so a peer's admin row can never enter the set
 * that the role predicates run over.
 */

const eq = vi.fn();
const order2 = vi.fn();
const selectResult = {
  rows: [] as Record<string, unknown>[],
};

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          eq(table, col, val);
          return chain;
        },
        order: () => {
          order2();
          return chain;
        },
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: selectResult.rows, error: null }),
      };
      return chain;
    },
  }),
}));

vi.mock('@/services/iteraUser', () => ({
  getIteraUserId: async () => 'itera-user-me',
}));

import { getMyMemberships, isTenantAdmin } from '@/services/membership.service';

describe('getMyMemberships — scoped to the caller, not to whatever RLS returns', () => {
  beforeEach(() => {
    eq.mockClear();
    selectResult.rows = [];
  });

  it("filters the query by the caller's itera user id", async () => {
    await getMyMemberships();
    expect(eq).toHaveBeenCalledWith('memberships', 'user_id', 'itera-user-me');
  });

  it('returns empty (never an unscoped read) when the itera user id is unresolvable', async () => {
    vi.resetModules();
    vi.doMock('@/services/iteraUser', () => ({ getIteraUserId: async () => null }));
    const mod = await import('@/services/membership.service');
    const rows = await mod.getMyMemberships();
    expect(rows).toEqual([]);
    expect(eq).not.toHaveBeenCalled();
    vi.doUnmock('@/services/iteraUser');
    vi.resetModules();
  });

  it("a peer's tenant_admin row cannot make an instructor an admin", () => {
    // The exact row set the instructor used to receive from the unfiltered read.
    const leaked = [
      { tenantId: 'T', role: 'instructor' as const, isPersonal: false },
      { tenantId: 'T', role: 'tenant_admin' as const, isPersonal: false }, // a COLLEAGUE's row
    ];
    expect(isTenantAdmin(leaked)).toBe(true); // ← what the bug exploited

    // Post-fix the query can only ever yield the caller's own rows:
    const scoped = [{ tenantId: 'T', role: 'instructor' as const, isPersonal: false }];
    expect(isTenantAdmin(scoped)).toBe(false);
  });
});
