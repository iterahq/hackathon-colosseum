import { describe, expect, it } from 'vitest';
import { PURCHASE_IDLE, isPurchaseBusy, purchaseReducer, type PurchaseEvent, type PurchaseState } from './purchaseMachine';

const run = (events: PurchaseEvent[], from: PurchaseState = PURCHASE_IDLE) => events.reduce(purchaseReducer, from);
const start: PurchaseEvent = { type: 'start', itemKey: 'life_refill' };

describe('purchaseReducer', () => {
  it('walks the happy path: connecting, signing, confirming, paid', () => {
    expect(run([start]).phase).toBe('connecting');
    expect(run([start, { type: 'connected' }]).phase).toBe('signing');
    expect(run([start, { type: 'connected' }, { type: 'signed' }]).phase).toBe('confirming');
    expect(run([start, { type: 'connected' }, { type: 'signed' }, { type: 'paid', explorerUrl: 'https://x/tx' }])).toEqual({
      phase: 'paid',
      itemKey: 'life_refill',
      detail: null,
      explorerUrl: 'https://x/tx',
    });
  });

  it('goes silently back to rest when the learner rejects in the wallet', () => {
    expect(run([start, { type: 'connected' }, { type: 'cancelled' }])).toEqual(PURCHASE_IDLE);
  });

  it('keeps what the wallet said when it fails', () => {
    const failed = run([start, { type: 'connected' }, { type: 'failed', detail: '-32603: boom' }]);
    expect(failed).toMatchObject({ phase: 'failed', itemKey: 'life_refill', detail: '-32603: boom' });
    expect(isPurchaseBusy(failed)).toBe(false);
  });

  it('offers the faucet on insufficient balance and returns there if the faucet is blocked', () => {
    const short = run([start, { type: 'connected' }, { type: 'insufficient', detail: 'insufficient lamports' }]);
    expect(short.phase).toBe('insufficient');
    const funding = purchaseReducer(short, { type: 'funding' });
    expect(funding.phase).toBe('funding');
    expect(purchaseReducer(funding, { type: 'funding_failed', detail: 'wallet-faucet: rate_limited' })).toMatchObject({
      phase: 'insufficient',
      detail: 'wallet-faucet: rate_limited',
    });
  });

  it('reports a browser with no wallet', () => {
    expect(run([start, { type: 'no_wallet' }]).phase).toBe('no_wallet');
  });

  it('ignores a second start while one purchase is in flight', () => {
    const signing = run([start, { type: 'connected' }]);
    expect(purchaseReducer(signing, { type: 'start', itemKey: 'outfit_crown' })).toBe(signing);
  });

  it('ignores out-of-order events', () => {
    expect(purchaseReducer(PURCHASE_IDLE, { type: 'paid', explorerUrl: null })).toBe(PURCHASE_IDLE);
    expect(run([start, { type: 'signed' }]).phase).toBe('connecting');
    expect(purchaseReducer(PURCHASE_IDLE, { type: 'failed', detail: 'late' })).toBe(PURCHASE_IDLE);
  });

  it('resets only from a resting phase', () => {
    const paid = run([start, { type: 'connected' }, { type: 'signed' }, { type: 'paid', explorerUrl: null }]);
    expect(purchaseReducer(paid, { type: 'reset' })).toEqual(PURCHASE_IDLE);
    const confirming = run([start, { type: 'connected' }, { type: 'signed' }]);
    expect(purchaseReducer(confirming, { type: 'reset' })).toBe(confirming);
  });
});
