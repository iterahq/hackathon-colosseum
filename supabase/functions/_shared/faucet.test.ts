import { describe, expect, it } from 'vitest';
import { DAILY_BUDGET_LAMPORTS, DROP_LAMPORTS, RETRY_AFTER_MS, claimStep, faucetMemo, unconfirmedStep, withinDailyBudget, type ClaimRow } from './faucet';

const now = new Date('2026-10-10T12:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const caller = { wallet: 'WALLET_A', userId: 'user-a' };
const row = (patch: Partial<ClaimRow> = {}): ClaimRow => ({ wallet: 'WALLET_A', user_id: 'user-a', tx_signature: 'SIG', created_at: ago(60_000), confirmed_at: ago(55_000), ...patch });

describe('faucet: one claim per learner and per wallet', () => {
  it('sends when neither the learner nor the wallet ever claimed', () => {
    expect(claimStep([], caller, now)).toBe('send');
  });

  it('refuses a confirmed claim of this learner with this wallet', () => {
    expect(claimStep([row()], caller, now)).toBe('already_claimed');
  });

  it('refuses the same learner with another wallet, and the same wallet under another learner', () => {
    expect(claimStep([row({ wallet: 'WALLET_B' })], caller, now)).toBe('already_claimed');
    expect(claimStep([row({ user_id: 'user-b' })], caller, now)).toBe('already_claimed');
    expect(claimStep([row({ wallet: 'WALLET_B', confirmed_at: null, created_at: ago(3_600_000) })], caller, now)).toBe('already_claimed');
    expect(claimStep([row({ confirmed_at: null, created_at: ago(3_600_000) }), row({ wallet: 'WALLET_B' })], caller, now)).toBe('already_claimed');
  });
});

describe('faucet: a transfer that timed out is never paid twice', () => {
  it('keeps the lock while the transfer may still land', () => {
    expect(claimStep([row({ confirmed_at: null, created_at: ago(RETRY_AFTER_MS - 1) })], caller, now)).toBe('already_claimed');
    expect(claimStep([row({ confirmed_at: null, tx_signature: null, created_at: ago(5_000) })], caller, now)).toBe('already_claimed');
    expect(RETRY_AFTER_MS).toBeGreaterThanOrEqual(150_000);
  });

  it('asks the chain once the blockhash window is long gone, and sends again only if nothing landed', () => {
    expect(claimStep([row({ confirmed_at: null, created_at: ago(RETRY_AFTER_MS) })], caller, now)).toBe('check_chain');
    expect(unconfirmedStep('landed')).toBe('confirm');
    expect(unconfirmedStep('in_flight')).toBe('wait');
    expect(unconfirmedStep('unknown')).toBe('resend');
    expect(unconfirmedStep('failed')).toBe('resend');
    expect(unconfirmedStep(null)).toBe('resend');
  });
});

describe('faucet: daily budget', () => {
  it('gives 0.3 SOL in 24 hours, thirty drops, and not one more', () => {
    expect(DAILY_BUDGET_LAMPORTS).toBe(300_000_000n);
    expect(withinDailyBudget(0n)).toBe(true);
    expect(withinDailyBudget(DAILY_BUDGET_LAMPORTS - DROP_LAMPORTS)).toBe(true);
    expect(withinDailyBudget(DAILY_BUDGET_LAMPORTS - DROP_LAMPORTS + 1n)).toBe(false);
    expect(withinDailyBudget(DAILY_BUDGET_LAMPORTS)).toBe(false);
    expect(withinDailyBudget(-1n)).toBe(false);
  });
});

describe('faucet memo', () => {
  it('names the wallet it pays, never a learner id', () => {
    expect(faucetMemo('CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B')).toBe('faucet:CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B');
  });
});
