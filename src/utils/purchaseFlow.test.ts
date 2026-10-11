import { describe, expect, it } from 'vitest';
import { ShopCallError } from '@/services/shopTransport';
import { WalletSignError } from '@/services/walletSign';
import type { PurchaseConfirmation } from '@/types/shop';
import { failureEvent, paidProof, timedOut, walletMismatch } from './purchaseFlow';

const pending = (over: Partial<PurchaseConfirmation> = {}): PurchaseConfirmation => ({ status: 'pending', itemKey: null, lives: null, companion: null, inventory: null, explorerUrl: null, ...over });

describe('timedOut', () => {
  it('a paid intent whose delivery keeps failing is apply_failed, never "nothing was charged"', () => {
    expect(timedOut(pending({ paymentSettled: true, pendingCode: 'apply_failed' }))).toEqual({ code: 'apply_failed', detail: 'purchase-confirm: apply_failed' });
  });

  it('a transaction the cluster has not shown yet stays tx_not_found', () => {
    expect(timedOut(pending({ pendingCode: 'tx_not_found' })).code).toBe('tx_not_found');
  });

  it('anything else is the backend code, or the network', () => {
    expect(timedOut(pending({ pendingCode: 'rpc_unavailable' })).code).toBe('rpc_unavailable');
    expect(timedOut(pending()).code).toBe('rpc_unavailable');
  });
});

describe('walletMismatch', () => {
  it('is silent when either side is unknown or they agree', () => {
    expect(walletMismatch(null, 'A')).toBeNull();
    expect(walletMismatch('A', null)).toBeNull();
    expect(walletMismatch('A', 'A')).toBeNull();
  });

  it('names both wallets when the browser holds another account', () => {
    const e = walletMismatch('CuVeEAWzJhEqibA8TG74fSzPyr73bS7xB7sDJ5GZtmVB', 'DHYPLR77qfABr7wVGYjnX6VNoCg3QcW8eedenuuBg5Af');
    expect(e?.code).toBe('wallet_mismatch');
    expect(e?.message).toBe('wallet_mismatch: CuVe…tmVB ≠ DHYP…g5Af');
    expect(e?.detail).toContain('CuVeEAWzJhEqibA8TG74fSzPyr73bS7xB7sDJ5GZtmVB');
  });
});

describe('failureEvent', () => {
  it('a rejection in the wallet closes quietly', () => {
    expect(failureEvent(new WalletSignError('cancelled', '4001: User rejected'))).toEqual({ type: 'cancelled' });
  });

  it('a dead blockhash is an expired intent, nothing charged', () => {
    expect(failureEvent(new WalletSignError('expired', 'Blockhash not found'))).toMatchObject({ type: 'failed', code: 'intent_expired' });
  });

  it('a wallet that gave up is wallet_failed, apart from a backend refusal', () => {
    expect(failureEvent(new WalletSignError('failed', '-32003: Transaction failed'))).toMatchObject({ type: 'failed', code: 'wallet_failed', detail: '-32003: Transaction failed' });
    expect(failureEvent(new ShopCallError('purchase-intent: sold_out', 409, 'sold_out'))).toMatchObject({ type: 'failed', code: 'sold_out' });
  });

  it('insufficient funds carries what the backend says is needed', () => {
    const e = new ShopCallError('purchase-intent: insufficient_funds', 402, 'insufficient_funds', false, null, null, { required_lamports: 1_445_880 });
    expect(failureEvent(e)).toEqual({ type: 'insufficient', detail: 'purchase-intent: insufficient_funds', neededLamports: 1_445_880 });
  });

  it('a paid intent whose item is gone is refund_due with the payment link, not the item code', () => {
    const e = new ShopCallError('purchase-confirm: sold_out', 409, 'sold_out', false, null, null, { error: 'sold_out', status: 'paid', refund_due: true, explorer_url: 'https://x/tx/SIG' });
    expect(failureEvent(e)).toEqual({ type: 'failed', detail: 'purchase-confirm: sold_out', code: 'refund_due', explorerUrl: 'https://x/tx/SIG' });
  });
});

describe('paidProof', () => {
  it('reads the payment from the explorer url when the wallet only signed', () => {
    const proof = paidProof(pending({ status: 'paid', explorerUrl: 'https://x/tx/PAY?cluster=devnet', chain: { signature: 'MIR', explorerUrl: 'https://x/tx/MIR', lives: null } }), null);
    expect(proof.signature).toBe('PAY');
    expect(proof.chain).toEqual({ signature: 'MIR', explorerUrl: 'https://x/tx/MIR' });
  });

  it('shows no on-chain row when the mirror is the payment itself', () => {
    expect(paidProof(pending({ status: 'paid', chain: { signature: 'PAY', explorerUrl: 'u', lives: null } }), 'PAY').chain).toBeNull();
  });
});
