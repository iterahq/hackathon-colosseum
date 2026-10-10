import { describe, expect, it } from 'vitest';
import { asLedgerVerdict, settlePayment, settledElsewhere } from './payments';
import type { IteraClient } from './db';

const SIGNATURE = '5'.repeat(88);
const INTENT = '0b0e1f7a-58e5-4f0c-9d55-7a1f6f1e2c3d';
const OTHER = '7d0f3c1e-2a4b-4c5d-8e6f-9a0b1c2d3e4f';

function fakeDb(parts: { rpc?: unknown; row?: { ref_id: string } | null; error?: { message: string } }) {
  const calls: unknown[] = [];
  const db = {
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      return Promise.resolve({ data: parts.rpc ?? null, error: parts.error ?? null });
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: parts.row ?? null, error: parts.error ?? null }) }) }) }),
  } as unknown as IteraClient;
  return { db, calls };
}

describe('payments ledger', () => {
  it('passes the intent, the signature and the stored lamports to the one settle function', async () => {
    const { db, calls } = fakeDb({ rpc: 'settled' });
    expect(await settlePayment(db, 'gift', INTENT, SIGNATURE, 550_000)).toBe('settled');
    expect(calls).toEqual([['settle_payment', { p_kind: 'gift', p_ref_id: INTENT, p_signature: SIGNATURE, p_lamports: 550_000 }]]);
  });

  it('reads every refusal and never treats an unknown answer as paid', async () => {
    for (const verdict of ['signature_reused', 'already_paid', 'not_payable', 'not_found'] as const) {
      expect(await settlePayment(fakeDb({ rpc: verdict }).db, 'purchase', INTENT, SIGNATURE, 1)).toBe(verdict);
    }
    expect(() => asLedgerVerdict(null)).toThrow();
    expect(() => asLedgerVerdict('ok')).toThrow();
    await expect(settlePayment(fakeDb({ error: { message: 'down' } }).db, 'purchase', INTENT, SIGNATURE, 1)).rejects.toThrow('down');
  });

  it('tells a signature that settled another intent from one that settled this one or none', async () => {
    expect(await settledElsewhere(fakeDb({ row: { ref_id: OTHER } }).db, SIGNATURE, INTENT)).toBe(true);
    expect(await settledElsewhere(fakeDb({ row: { ref_id: INTENT } }).db, SIGNATURE, INTENT)).toBe(false);
    expect(await settledElsewhere(fakeDb({ row: null }).db, SIGNATURE, INTENT)).toBe(false);
  });
});
