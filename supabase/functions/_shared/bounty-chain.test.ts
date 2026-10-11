import { describe, expect, it } from 'vitest';
import { acceptPlan, matchesTerms, refundPlan, releasePlan, type EscrowTerms } from './bounty-chain';
import type { EscrowState } from './bounty-program';

const PROGRAM = 'ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq';
const ESCROW = 'CHJxRB4JDpwUXaGqD5NmZ5KZSZ95vmW4fELpPjmkKtzj';
const TREASURY = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';
const COLLECTION = 'Eu6EyWEiDdCT7cKmVaGMeRFWvoNdUMGPVe1eou2du91b';
const A = '95SAp7c7fHSurHmR2H42oopwHfkr2c4aV5wwYsyQpMAc';
const CERT_A = 'Aqhq7VqZTmEGqGNtFSG3ywVELZx8T3DmoeTenrTAoNQj';
const D = 'EANhMJvJo2dKjEosCmExDvrzxn5LhT8R51nanJpcaXu5';
const CERT_D = '4FkL85hUkteCR8oiAEm6Y6pUKKnamMw4iwvZcYfNeEpQ';
const ID = '87279dd4-a560-4e43-a020-372f2a8cd87e';
const party = { programId: PROGRAM, approver: TREASURY, attester: TREASURY, escrow: ESCROW };
const terms: EscrowTerms = { ...party, sponsor: TREASURY, collection: COLLECTION, bountyId: ID, amount: 50_000_000n, expiresAt: 1_800_000_000 };

function state(overrides: Partial<EscrowState> = {}): EscrowState {
  return { status: 'open', id: ID, sponsor: TREASURY, approver: TREASURY, collection: COLLECTION, amount: 50_000_000n, expiresAt: 1_800_000_000, claimant: null, certification: null, ...overrides };
}
const tags = (plan: unknown) => (Array.isArray(plan) ? plan.map((instruction) => instruction.data[0]) : plan);

describe('matchesTerms', () => {
  it('accepts the account we posted', () => {
    expect(matchesTerms(state(), terms)).toBe(true);
    expect(matchesTerms(state({ amount: 60_000_000n, expiresAt: 1_900_000_000 }), terms)).toBe(true);
  });

  it.each([
    ['no account', null],
    ['another approver', state({ approver: A })],
    ['another refund destination', state({ sponsor: A })],
    ['another collection', state({ collection: A })],
    ['less money', state({ amount: 49_999_999n })],
    ['an earlier expiry', state({ expiresAt: 1_700_000_000 })],
    ['another bounty', state({ id: '11111111-1111-4111-8111-111111111111' })],
  ])('refuses %s', (_, candidate) => {
    expect(matchesTerms(candidate, terms)).toBe(false);
  });
});

describe('plans', () => {
  it('accepts on an open account', () => {
    expect(tags(acceptPlan(state(), party, A, CERT_A))).toEqual([1]);
  });

  it('lets go of a stale claim before accepting another wallet', () => {
    expect(tags(acceptPlan(state({ status: 'claimed', claimant: D, certification: CERT_D }), party, A, CERT_A))).toEqual([3, 1]);
  });

  it('asks for a fresh signature even when the account already names the wallet, and refuses a closed account', () => {
    expect(tags(acceptPlan(state({ status: 'claimed', claimant: A, certification: CERT_A }), party, A, CERT_A))).toEqual([3, 1]);
    expect(acceptPlan(state({ status: 'paid', claimant: A }), party, A, CERT_A)).toBe('closed');
    expect(acceptPlan(state({ status: 'refunded' }), party, A, CERT_A)).toBe('closed');
  });

  it('makes the claimant a signer of accept, beside the attester', () => {
    const [accept] = acceptPlan(state(), { ...party, attester: D }, A, CERT_A) as Array<{ accounts: Array<{ address: string; signer?: boolean }> }>;
    expect(accept.accounts.filter((account) => account.signer).map((account) => account.address)).toEqual([D, A]);
  });

  it('pays only a claimant the account already names: nobody is accepted on their behalf', () => {
    expect(tags(releasePlan(state({ status: 'claimed', claimant: A, certification: CERT_A }), party, A))).toEqual([2]);
    expect(releasePlan(state(), party, A)).toBe('closed');
    expect(releasePlan(state({ status: 'claimed', claimant: D, certification: CERT_D }), party, A)).toBe('closed');
  });

  it('never pays twice, never pays after a refund', () => {
    expect(releasePlan(state({ status: 'paid', claimant: A }), party, A)).toBe('done');
    expect(releasePlan(state({ status: 'paid', claimant: D }), party, A)).toBe('closed');
    expect(releasePlan(state({ status: 'refunded' }), party, A)).toBe('closed');
  });

  it('refunds to the sponsor the account names', () => {
    const plan = refundPlan(state({ sponsor: D }), party);
    expect(tags(plan)).toEqual([4]);
    expect(Array.isArray(plan) && plan[0].accounts[2]).toEqual({ address: D, writable: true });
    expect(tags(refundPlan(state({ status: 'claimed', claimant: A }), party))).toEqual([3, 4]);
    expect(refundPlan(state({ status: 'refunded' }), party)).toBe('done');
    expect(refundPlan(state({ status: 'paid', claimant: A }), party)).toBe('closed');
  });
});
