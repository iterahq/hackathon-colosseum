import { describe, expect, it } from 'vitest';
import { INVITEE_ERROR_CODES, inviteeVerdict, openInvites, parseInviteeParam, secondsLeft } from './directBounty';
import type { Bounty, InviteeCheck } from '@/types/bounty';

const WALLET = 'BRNkmbKCGxqL4p9W67sgiHRev6VAdzScSqBQYmS36Upx';

const check = (patch: Partial<InviteeCheck>): InviteeCheck => ({
  wallet: WALLET,
  directAvailable: true,
  knownLearner: true,
  eligible: false,
  reason: null,
  proof: null,
  requirement: { unitId: 'u1', minDays: 2, totalDays: 5 },
  ...patch,
});

describe('parseInviteeParam', () => {
  it('is none without the parameter or with an empty one', () => {
    expect(parseInviteeParam('')).toEqual({ kind: 'none' });
    expect(parseInviteeParam('?to=')).toEqual({ kind: 'none' });
    expect(parseInviteeParam('?to=%20')).toEqual({ kind: 'none' });
  });
  it('reads a wallet-shaped value', () => {
    expect(parseInviteeParam(`?to=${WALLET}`)).toEqual({ kind: 'ok', wallet: WALLET });
    expect(parseInviteeParam(new URLSearchParams({ to: ` ${WALLET} ` }))).toEqual({ kind: 'ok', wallet: WALLET });
  });
  it('marks anything else invalid, links and look-alikes included', () => {
    expect(parseInviteeParam('?to=hello')).toEqual({ kind: 'invalid' });
    expect(parseInviteeParam('?to=https://evil.example/x')).toEqual({ kind: 'invalid' });
    expect(parseInviteeParam(`?to=0${WALLET.slice(1)}`)).toEqual({ kind: 'invalid' });
  });
});

describe('inviteeVerdict', () => {
  it('is eligible with the days counted', () => {
    expect(inviteeVerdict(check({ eligible: true, proof: { asset: 'a', daysDone: 3, explorerUrl: null } }))).toEqual({ kind: 'eligible', daysDone: 3 });
  });
  it('says what is missing', () => {
    expect(inviteeVerdict(check({ reason: 'not_enough_days', proof: { asset: 'a', daysDone: 1, explorerUrl: null } }))).toEqual({ kind: 'missing', reason: 'not_enough_days', daysDone: 1, minDays: 2 });
    expect(inviteeVerdict(check({ reason: 'no_certification' }))).toEqual({ kind: 'missing', reason: 'no_certification', daysDone: 0, minDays: 2 });
  });
  it('tells a wallet Itera has never seen', () => {
    expect(inviteeVerdict(check({ knownLearner: false, reason: 'no_certification' }))).toEqual({ kind: 'unknown_learner' });
  });
});

describe('inbox helpers', () => {
  const row = (patch: Partial<Bounty>) => ({ id: 'x', direct: true, status: 'open', ...patch }) as Bounty;
  it('keeps the direct bounties that are still open', () => {
    const kept = openInvites([row({ id: 'a' }), row({ id: 'b', status: 'paid' }), row({ id: 'c', direct: false }), row({ id: 'd', status: 'refunded' })]);
    expect(kept.map((b) => b.id)).toEqual(['a']);
  });
  it('counts seconds left and drops a past or missing date', () => {
    const now = Date.parse('2026-10-11T00:00:00Z');
    expect(secondsLeft('2026-10-11T01:00:00Z', now)).toBe(3600);
    expect(secondsLeft('2026-10-10T00:00:00Z', now)).toBeNull();
    expect(secondsLeft(null, now)).toBeNull();
    expect(secondsLeft('nope', now)).toBeNull();
  });
  it('names the refusals the form maps', () => {
    expect(INVITEE_ERROR_CODES).toContain('own_invitee');
  });
});
