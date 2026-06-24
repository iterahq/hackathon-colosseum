import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the XP-on-completion award path.
 *
 * Contract:
 *  - completing an activity awards exactly ONE xp_events row of value 10 (the
 *    configurable default ITERA_XP_PER_ACTIVITY),
 *  - re-completing the SAME activity does NOT award a second time (idempotent).
 *
 * The DB-level idempotency lives in the SECURITY DEFINER RPC
 * itera.award_activity_xp (migration 0008: partial unique index on
 * xp_events(user_id, reason) + ON CONFLICT DO NOTHING). Here we mock the RPC to
 * mimic that contract and assert the client behaves correctly against it.
 */

import { parseXpPerActivity } from '@/config/gamification';

// --- in-memory xp_events mimicking the unique (user_id, reason) constraint ---
type XpRow = { user_id: string; amount: number; reason: string };
const xpEvents: XpRow[] = [];
const FIXED_USER = 'itera-user-1';

// rpc args captured for assertions
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

function awardRpc(args: { p_activity_id: string; p_amount: number }) {
  const reason = `activity_complete:${args.p_activity_id}`;
  // mimic the partial unique index: at most one row per (user, reason)
  const exists = xpEvents.some((r) => r.user_id === FIXED_USER && r.reason === reason);
  if (exists) return { data: 0, error: null }; // ON CONFLICT DO NOTHING -> 0 awarded
  xpEvents.push({ user_id: FIXED_USER, amount: args.p_amount, reason });
  return { data: args.p_amount, error: null };
}

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(awardRpc(args as { p_activity_id: string; p_amount: number }));
    },
  }),
}));

import { awardActivityXp } from '@/services/gamification.service';

describe('parseXpPerActivity (config constant)', () => {
  it('defaults to 10 when unset/empty', () => {
    expect(parseXpPerActivity(undefined)).toBe(10);
    expect(parseXpPerActivity('')).toBe(10);
  });
  it('honors a valid override', () => {
    expect(parseXpPerActivity('25')).toBe(25);
    expect(parseXpPerActivity('0')).toBe(0);
  });
  it('falls back to 10 on garbage', () => {
    expect(parseXpPerActivity('abc')).toBe(10);
    expect(parseXpPerActivity('-5')).toBe(10);
  });
});

describe('awardActivityXp (idempotent XP on completion)', () => {
  beforeEach(() => {
    xpEvents.length = 0;
    rpcCalls = [];
  });

  it('completing an activity inserts exactly one xp_events row of value 10', async () => {
    const awarded = await awardActivityXp('activity-A');
    expect(awarded).toBe(10);
    expect(xpEvents).toHaveLength(1);
    expect(xpEvents[0]).toMatchObject({ amount: 10, reason: 'activity_complete:activity-A' });
    // called the right RPC with the default amount
    expect(rpcCalls).toEqual([
      { fn: 'award_activity_xp', args: { p_activity_id: 'activity-A', p_amount: 10 } },
    ]);
  });

  it('re-completing the same activity does NOT add a second row', async () => {
    await awardActivityXp('activity-A');
    const second = await awardActivityXp('activity-A');
    expect(second).toBe(0); // no XP on the duplicate
    expect(xpEvents).toHaveLength(1); // still exactly one row
    const total = xpEvents.reduce((s, r) => s + r.amount, 0);
    expect(total).toBe(10); // not 20
  });

  it('different activities each award once', async () => {
    await awardActivityXp('activity-A');
    await awardActivityXp('activity-B');
    expect(xpEvents).toHaveLength(2);
    expect(xpEvents.reduce((s, r) => s + r.amount, 0)).toBe(20);
  });

  it('passes a configured non-default amount through', async () => {
    const awarded = await awardActivityXp('activity-C', 25);
    expect(awarded).toBe(25);
    expect(xpEvents[0]).toMatchObject({ amount: 25 });
  });
});
