import { describe, expect, it } from 'vitest';
import {
  NEVER_RAN_AFTER_MS,
  RESEND_AFTER_MS,
  RETRY_WINDOW_MS,
  TREASURY_FLOOR_LAMPORTS,
  circuitDecision,
  circuitMemo,
  circuitRetryDue,
  circuitShare,
  circuitTotals,
  plannedCircuit,
  resumeStep,
  stampsFunded,
  usdCentsOf,
} from './circuit.ts';

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

describe('circuit after the response', () => {
  it('states the share from the paid row alone', () => {
    expect(plannedCircuit({ status: 'paid', source: 'payment', purchaseLamports: 1_100_000n })).toEqual({ lamports: 550_000n, stampsFunded: 110 });
    expect(plannedCircuit({ status: 'paid', source: 'payment', purchaseLamports: 550_000n })).toEqual({ lamports: 275_000n, stampsFunded: 55 });
    expect(plannedCircuit({ status: 'pending', source: 'payment', purchaseLamports: 1_100_000n })).toBeNull();
    expect(plannedCircuit({ status: 'paid', source: 'claim', purchaseLamports: 1_100_000n })).toBeNull();
    expect(plannedCircuit({ status: 'paid', source: 'payment', purchaseLamports: 1n })).toBeNull();
  });
});

describe('circuit retry', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const row = (patch: Partial<Parameters<typeof circuitRetryDue>[0]>) => ({ status: 'paid', source: 'payment', circuitStatus: null, paidAt: ago(10 * 60_000), circuitAt: null, ...patch });

  it('takes a transfer that never ran once the purchase is a minute old', () => {
    expect(circuitRetryDue(row({ paidAt: ago(NEVER_RAN_AFTER_MS - 1) }), now)).toBe(false);
    expect(circuitRetryDue(row({ paidAt: ago(NEVER_RAN_AFTER_MS) }), now)).toBe(true);
  });

  it('takes a claimed or failed transfer only after the blockhash window is long gone', () => {
    for (const circuitStatus of ['pending', 'failed']) {
      expect(circuitRetryDue(row({ circuitStatus, circuitAt: ago(RESEND_AFTER_MS - 1) }), now)).toBe(false);
      expect(circuitRetryDue(row({ circuitStatus, circuitAt: ago(RESEND_AFTER_MS) }), now)).toBe(true);
    }
    expect(RESEND_AFTER_MS).toBeGreaterThanOrEqual(150_000);
  });

  it('never takes a sent or skipped transfer, an unpaid intent, a free claim or an old purchase', () => {
    expect(circuitRetryDue(row({ circuitStatus: 'sent', circuitAt: ago(3_600_000) }), now)).toBe(false);
    expect(circuitRetryDue(row({ circuitStatus: 'skipped', circuitAt: ago(3_600_000) }), now)).toBe(false);
    expect(circuitRetryDue(row({ status: 'pending', paidAt: null }), now)).toBe(false);
    expect(circuitRetryDue(row({ source: 'claim' }), now)).toBe(false);
    expect(circuitRetryDue(row({ paidAt: ago(RETRY_WINDOW_MS + 1) }), now)).toBe(false);
    expect(circuitRetryDue(row({ paidAt: new Date(now.getTime() + 60_000).toISOString() }), now)).toBe(false);
  });

  it('records a transfer the chain already has instead of sending it again', () => {
    expect(resumeStep({ storedSignature: 'SIG', stored: 'landed', byMemo: null })).toEqual({ action: 'record', signature: 'SIG' });
    expect(resumeStep({ storedSignature: null, stored: null, byMemo: 'MEMO_SIG' })).toEqual({ action: 'record', signature: 'MEMO_SIG' });
    expect(resumeStep({ storedSignature: 'OLD', stored: 'unknown', byMemo: 'MEMO_SIG' })).toEqual({ action: 'record', signature: 'MEMO_SIG' });
  });

  it('waits for a transfer still in flight and sends only when the chain has nothing', () => {
    expect(resumeStep({ storedSignature: 'SIG', stored: 'in_flight', byMemo: null })).toEqual({ action: 'wait' });
    expect(resumeStep({ storedSignature: 'SIG', stored: 'unknown', byMemo: null })).toEqual({ action: 'send' });
    expect(resumeStep({ storedSignature: 'SIG', stored: 'failed', byMemo: null })).toEqual({ action: 'send' });
    expect(resumeStep({ storedSignature: null, stored: null, byMemo: null })).toEqual({ action: 'send' });
  });
});
