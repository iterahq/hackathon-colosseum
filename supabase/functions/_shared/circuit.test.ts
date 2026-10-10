import { describe, expect, it } from 'vitest';
import { TREASURY_FLOOR_LAMPORTS, circuitDecision, circuitMemo, circuitShare, circuitTotals, stampsFunded, usdCentsOf } from './circuit.ts';

const paid = { status: 'paid', source: 'payment', purchaseLamports: 1_100_000n, treasuryBalance: 375_000_000n };

describe('circuit amounts', () => {
  it('is half of the purchase, floored, in integers', () => {
    expect(circuitShare(1_100_000n)).toBe(550_000n);
    expect(circuitShare(2_750_000n)).toBe(1_375_000n);
    expect(circuitShare(5n)).toBe(2n);
    expect(circuitShare(0n)).toBe(0n);
    expect(circuitShare(-10n)).toBe(0n);
  });

  it('counts stamps at 5 000 lamports each, floored', () => {
    expect(stampsFunded(550_000n)).toBe(110);
    expect(stampsFunded(4_999n)).toBe(0);
    expect(stampsFunded(0n)).toBe(0);
  });

  it('converts at the pinned shop rate', () => {
    expect(usdCentsOf(550_000n)).toBe(10);
    expect(usdCentsOf(54_999n)).toBe(0);
  });

  it('carries the purchase id in the memo', () => {
    expect(circuitMemo('8ba48490-0000-4000-8000-000000000001')).toBe('circuit:8ba48490-0000-4000-8000-000000000001');
  });
});

describe('circuitDecision', () => {
  it('sends half of a paid purchase', () => {
    expect(circuitDecision(paid)).toEqual({ action: 'send', lamports: 550_000n });
  });

  it('never moves anything for a purchase that is not paid, or for a free claim', () => {
    for (const status of ['pending', 'expired', 'failed', 'refunded']) expect(circuitDecision({ ...paid, status })).toEqual({ action: 'skip', reason: 'not_paid' });
    expect(circuitDecision({ ...paid, source: 'claim', purchaseLamports: 0n })).toEqual({ action: 'skip', reason: 'not_paid' });
    expect(circuitDecision({ ...paid, purchaseLamports: 1n })).toEqual({ action: 'skip', reason: 'nothing_to_send' });
  });

  it('skips when the treasury would fall below its floor, fee included', () => {
    const exact = TREASURY_FLOOR_LAMPORTS + 550_000n + 5_000n;
    expect(circuitDecision({ ...paid, treasuryBalance: exact })).toEqual({ action: 'send', lamports: 550_000n });
    expect(circuitDecision({ ...paid, treasuryBalance: exact - 1n })).toEqual({ action: 'skip', reason: 'treasury_floor' });
    expect(circuitDecision({ ...paid, treasuryBalance: 0n })).toEqual({ action: 'skip', reason: 'treasury_floor' });
  });
});

describe('circuitTotals', () => {
  it('adds what was sent', () => {
    expect(circuitTotals([{ circuit_lamports: 550_000 }, { circuit_lamports: '1375000' }, { circuit_lamports: null }])).toEqual({ total_lamports: 1_925_000, total_usd_cents: 35, purchases: 3, stamps_funded: 385 });
    expect(circuitTotals([])).toEqual({ total_lamports: 0, total_usd_cents: 0, purchases: 0, stamps_funded: 0 });
  });
});
