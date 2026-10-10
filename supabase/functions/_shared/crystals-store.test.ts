import { describe, expect, it, vi } from 'vitest';

// The store needs the Deno-only client and the companion store (chain code) at import time; neither is used here.
vi.mock('./db.ts', () => ({}));
vi.mock('./companion-store.ts', () => ({ TIME_ZONE: 'America/Sao_Paulo', inBackground: () => undefined }));
vi.mock('./shop-items.ts', () => ({ ITEM_COLUMNS: '', PURCHASE_COLUMNS: '' }));

import { loadLossesOn, loadPaidKeys, readAll, reconcileCrystals, reconcileRefunds, refundCrystalPurchase, refundsDue } from './crystals-store.ts';

type Row = Record<string, unknown>;

/** A fake PostgREST client: filters like the real one and caps every answer at 1 000 rows, whatever `range` asks. */
function fakeDb(tables: Record<string, Row[]>, hooks: { failUpdate?: boolean; failRpc?: boolean; rpcCalls?: Row[]; updates?: Row[] } = {}) {
  const query = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];
    let patch: Row | null = null;
    let from = 0;
    let to = 999;
    const run = () => {
      if (patch) {
        hooks.updates?.push({ table, patch, eqs: Object.fromEntries(eqs) });
        return Promise.resolve({ data: null, error: hooks.failUpdate ? { message: 'update failed' } : null });
      }
      const rows = (tables[table] ?? []).filter((row) => eqs.every(([key, value]) => row[key] === value) && ins.every(([key, values]) => values.includes(row[key])));
      return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null });
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (value: Row) => ((patch = value), chain),
      eq: (key: string, value: unknown) => (eqs.push([key, value]), chain),
      in: (key: string, values: unknown[]) => (ins.push([key, values]), chain),
      order: () => chain,
      range: (a: number, b: number) => ((from = a), (to = b), chain),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => run().then(resolve, reject),
    };
    return chain;
  };
  return {
    from: query,
    rpc: (name: string, args: Row) => {
      hooks.rpcCalls?.push({ name, ...args });
      if (hooks.failRpc) return Promise.resolve({ data: null, error: { message: 'rpc failed' } });
      return Promise.resolve({ data: [{ balance: 150, is_new: true }], error: null });
    },
  } as never;
}

const USER = 'u1';
const many = (count: number, make: (index: number) => Row): Row[] => Array.from({ length: count }, (_, index) => make(index));

describe('paged, filtered reads (N2)', () => {
  it('readAll pages past the 1 000-row answer cap', async () => {
    const rows = many(2500, (index) => ({ n: index }));
    const db = fakeDb({ t: rows }) as { from: (t: string) => { select: () => { range: (a: number, b: number) => Promise<{ data: Row[]; error: null }> } } };
    const all = await readAll<Row>((from, to) => db.from('t').select().range(from, to), 't');
    expect(all).toHaveLength(2500);
  });

  it('losses are read only for the activities asked for, through more than 1 000 rows', async () => {
    const rows = [
      ...many(1500, () => ({ user_id: USER, kind: 'lose', activity_id: 'wanted', created_at: '2026-10-10T10:00:00Z' })),
      ...many(3000, (index) => ({ user_id: USER, kind: 'lose', activity_id: `other-${index}`, created_at: '2026-10-10T10:00:00Z' })),
      { user_id: 'someone-else', kind: 'lose', activity_id: 'wanted', created_at: '2026-10-10T10:00:00Z' },
    ];
    const found = await loadLossesOn(fakeDb({ life_events: rows }), USER, ['wanted']);
    expect(found).toHaveLength(1500);
    expect(await loadLossesOn(fakeDb({ life_events: rows }), USER, [])).toEqual([]);
  });

  it('the ledger is read only for the entitled reasons and refs, and a payment beyond row 1 000 is still seen', async () => {
    const refs = many(1200, (index) => `lesson-${index}`);
    const ledger = [
      ...refs.map((ref) => ({ user_id: USER, reason: 'lesson_completed', ref_id: ref })),
      ...many(4000, (index) => ({ user_id: USER, reason: 'spend', ref_id: `item:${index}` })),
      { user_id: 'other', reason: 'lesson_completed', ref_id: 'lesson-5' },
    ];
    const paid = await loadPaidKeys(fakeDb({ crystal_ledger: ledger }), USER, refs.map((ref) => ({ reason: 'lesson_completed', refId: ref })));
    expect(paid.size).toBe(1200);
    expect(paid.has('lesson_completed|lesson-1199')).toBe(true);
    expect(paid.has('spend|item:1')).toBe(false);
  });

  it('a lost life far down a long event log still makes the lesson not clean, and pays no clean bonus', async () => {
    const LESSON = '11111111-1111-4111-8111-111111111111';
    const rows = [
      ...many(1500, (index) => ({ user_id: USER, kind: 'lose', activity_id: `noise-${index}`, created_at: '2026-10-10T10:00:00Z' })),
      { user_id: USER, kind: 'lose', activity_id: 'a1', created_at: '2026-10-10T10:00:00Z' },
    ];
    const rpcCalls: Row[] = [];
    const db = fakeDb({ life_events: rows, crystal_ledger: [], purchases: [] }, { rpcCalls });
    await reconcileCrystals(db, USER, [{ achievement_key: 'day_stamp', ref_id: LESSON, earned_at: '2026-10-10T12:00:00Z' }], [{ id: 'a1', lesson_id: LESSON }]);
    expect(rpcCalls.map((call) => call.p_reason).sort()).toEqual(['day_completed', 'lesson_completed']);
  });
});

describe('refund order (N1)', () => {
  it('marks the purchase refunded FIRST, then credits, keyed by the purchase id', async () => {
    const order: string[] = [];
    const db = fakeDb({}, { updates: { push: () => order.push('update') } as never, rpcCalls: { push: (call: Row) => order.push(`credit ${call.p_reason} ${call.p_ref_id} ${call.p_amount}`) } as never });
    expect(await refundCrystalPurchase(db, USER, 'p1', 150, 'sold_out_after_payment')).toEqual({ balance: 150 });
    expect(order).toEqual(['update', 'credit refund p1 150']);
  });

  it('failure 1: the status update fails -> nothing is credited and the error surfaces (the row is still paid)', async () => {
    const rpcCalls: Row[] = [];
    await expect(refundCrystalPurchase(fakeDb({}, { failUpdate: true, rpcCalls }), USER, 'p1', 150, 'x')).rejects.toThrow(/purchases refunded/);
    expect(rpcCalls).toEqual([]);
  });

  it('failure 2: the credit fails after the row is refunded -> it throws, and reconcile pays it later, once', async () => {
    const updates: Row[] = [];
    await expect(refundCrystalPurchase(fakeDb({}, { failRpc: true, updates }), USER, 'p1', 150, 'x')).rejects.toThrow(/crystal_grant/);
    expect(updates).toHaveLength(1);
    const tables = {
      purchases: [{ id: 'p1', user_id: USER, source: 'crystals', status: 'refunded', memo: 'base_x:ref' }],
      crystal_ledger: [{ user_id: USER, reason: 'spend', ref_id: 'base_x:ref', delta: -150 }],
    };
    const rpcCalls: Row[] = [];
    expect(await reconcileRefunds(fakeDb(tables, { rpcCalls }), USER)).toBe(1);
    expect(rpcCalls).toMatchObject([{ p_user_id: USER, p_amount: 150, p_reason: 'refund', p_ref_id: 'p1' }]);
    // Once the refund row exists there is nothing to pay.
    const paidAlready = { ...tables, crystal_ledger: [...tables.crystal_ledger, { user_id: USER, reason: 'refund', ref_id: 'p1', delta: 150 }] };
    const none: Row[] = [];
    expect(await reconcileRefunds(fakeDb(paidAlready, { rpcCalls: none }), USER)).toBe(0);
    expect(none).toEqual([]);
  });

  it('refundsDue skips credited, unknown-debit and non-debit purchases', () => {
    const refunded = [
      { id: 'a', memo: 'm:a' },
      { id: 'b', memo: 'm:b' },
      { id: 'c', memo: 'm:c' },
    ];
    expect(refundsDue(refunded, new Set(['a']), new Map([['m:a', -100], ['m:b', -200], ['m:c', 50]]))).toEqual([{ purchaseId: 'b', amount: 200 }]);
    expect(refundsDue(refunded, new Set(), new Map())).toEqual([]);
  });
});
