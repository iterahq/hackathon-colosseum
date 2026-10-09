import { describe, expect, it } from 'vitest';
import {
  CONFIRM_GRACE_MS,
  expiresAt,
  fundsCheck,
  intentPhase,
  missingTransactionVerdict,
  verifyPayment,
  type ParsedTransaction,
} from './purchase-verify';

const WALLET = 'BNCkAhpDgLhzncCYNTnENCzRZDvo2iLPdUSMm89qBoqH';
const OTHER = '2rAa7WJMQ4KXDWyT7HPmrWqB1XUwLwj9JSRwC8misnqA';
const TREASURY = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';
const MEMO = '0b0e1f7a-58e5-4f0c-9d55-7a1f6f1e2c3d';
const expected = { wallet: WALLET, treasury: TREASURY, lamports: 1_100_000n, memo: MEMO };

function tx(patch: { payer?: string; source?: string; destination?: string; lamports?: number | string; memo?: string | null; err?: unknown } = {}): ParsedTransaction {
  const instructions: ParsedTransaction['transaction']['message']['instructions'] = [
    { program: 'system', parsed: { type: 'transfer', info: { source: patch.source ?? WALLET, destination: patch.destination ?? TREASURY, lamports: patch.lamports ?? 1_100_000 } } },
  ];
  if (patch.memo !== null) instructions.push({ program: 'spl-memo', parsed: patch.memo ?? MEMO });
  return {
    meta: { err: patch.err ?? null },
    transaction: { message: { accountKeys: [{ pubkey: patch.payer ?? WALLET, signer: true }, { pubkey: TREASURY }], instructions } },
  };
}

describe('verifyPayment', () => {
  it('accepts the right payer, amount and memo', () => {
    expect(verifyPayment(tx(), expected)).toEqual({ ok: true, paidLamports: 1_100_000n });
  });

  it('accepts an overpayment and extra instructions a wallet may add', () => {
    const padded = tx({ lamports: '1200000' });
    padded.transaction.message.instructions.unshift({ program: 'compute-budget' }, { program: 'system', parsed: { type: 'createAccount', info: {} } });
    expect(verifyPayment(padded, expected)).toEqual({ ok: true, paidLamports: 1_200_000n });
  });

  it('refuses one lamport less', () => {
    expect(verifyPayment(tx({ lamports: 1_099_999 }), expected)).toEqual({ ok: false, error: 'payment_mismatch', detail: 'amount' });
  });

  it('refuses another destination', () => {
    expect(verifyPayment(tx({ destination: OTHER }), expected)).toEqual({ ok: false, error: 'payment_mismatch', detail: 'destination' });
  });

  it('refuses a wrong or missing memo', () => {
    expect(verifyPayment(tx({ memo: 'another-intent' }), expected)).toEqual({ ok: false, error: 'payment_mismatch', detail: 'memo' });
    expect(verifyPayment(tx({ memo: null }), expected)).toEqual({ ok: false, error: 'payment_mismatch', detail: 'memo' });
  });

  it('refuses another payer, as fee payer or as the source of the transfer', () => {
    expect(verifyPayment(tx({ payer: OTHER }), expected)).toEqual({ ok: false, error: 'payment_mismatch', detail: 'payer' });
    expect(verifyPayment(tx({ source: OTHER }), expected)).toEqual({ ok: false, error: 'payment_mismatch', detail: 'payer' });
  });

  it('refuses a failed transaction before looking at anything else', () => {
    expect(verifyPayment(tx({ err: { InstructionError: [0, 'Custom'] } }), expected)).toEqual({ ok: false, error: 'tx_failed' });
    expect(verifyPayment({ ...tx(), meta: null }, expected)).toEqual({ ok: false, error: 'tx_failed' });
  });

  it('ignores amounts that are not whole lamports', () => {
    expect(verifyPayment(tx({ lamports: 1_100_000.5 }), expected)).toEqual({ ok: false, error: 'payment_mismatch', detail: 'payer' });
    expect(verifyPayment(tx({ lamports: '-5' }), expected)).toEqual({ ok: false, error: 'payment_mismatch', detail: 'payer' });
  });
});

describe('intent lifetime', () => {
  const expires = '2026-10-09T12:00:00.000Z';
  const at = (ms: number) => new Date(new Date(expires).getTime() + ms);

  it('keeps an intent confirmable through the grace window, then expires it', () => {
    expect(intentPhase({ status: 'pending', expiresAt: expires }, at(-1_000))).toBe('confirmable');
    expect(intentPhase({ status: 'pending', expiresAt: expires }, at(CONFIRM_GRACE_MS))).toBe('confirmable');
    expect(intentPhase({ status: 'expired', expiresAt: expires }, at(60_000))).toBe('confirmable');
    expect(intentPhase({ status: 'pending', expiresAt: expires }, at(CONFIRM_GRACE_MS + 1))).toBe('expired');
  });

  it('reports a paid intent as paid and any other status as closed', () => {
    expect(intentPhase({ status: 'paid', expiresAt: expires }, at(CONFIRM_GRACE_MS * 3))).toBe('paid');
    expect(intentPhase({ status: 'refunded', expiresAt: expires }, at(0))).toBe('expired');
    expect(intentPhase({ status: 'failed', expiresAt: expires }, at(0))).toBe('expired');
  });

  it('tells a late transaction from one that can no longer land', () => {
    expect(missingTransactionVerdict(1_000, 1_100)).toBe('tx_not_found');
    expect(missingTransactionVerdict(1_100, 1_100)).toBe('tx_not_found');
    expect(missingTransactionVerdict(1_101, 1_100)).toBe('intent_expired');
    expect(missingTransactionVerdict(9_999, null)).toBe('tx_not_found');
  });

  it('estimates expiry from the blocks the blockhash has left', () => {
    const now = new Date('2026-10-09T12:00:00.000Z');
    expect(expiresAt(now, 1_000, 1_150)).toBe('2026-10-09T12:01:00.000Z');
    expect(expiresAt(now, 2_000, 1_150)).toBe(now.toISOString());
  });
});

describe('fundsCheck', () => {
  it('needs the price, the fee and a rent-exempt remainder (or an exactly empty wallet)', () => {
    expect(fundsCheck(1_100_000n + 5_000n + 890_880n, 1_100_000n)).toEqual({ ok: true, required: 1_995_880n });
    expect(fundsCheck(1_995_879n, 1_100_000n).ok).toBe(false);
    expect(fundsCheck(1_105_000n, 1_100_000n).ok).toBe(true);
    expect(fundsCheck(1_104_999n, 1_100_000n).ok).toBe(false);
    expect(fundsCheck(0n, 1_100_000n).ok).toBe(false);
  });
});
