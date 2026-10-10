import { describe, expect, it } from 'vitest';
import { CLAIM_WINDOW_MS, CODE_LENGTH, claimVerdict, codeFromBytes, inviteLink, isReferralCode, referralStatus } from './referral';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const facts = (patch: Partial<Parameters<typeof claimVerdict>[0]> = {}) => ({
  inviterId: 'inviter',
  callerId: 'caller',
  callerCreatedAt: ago(60_000),
  alreadyClaimed: false,
  now: NOW,
  ...patch,
});

describe('referral code', () => {
  it('is short, lowercase and never the raw input', () => {
    const code = codeFromBytes(Uint8Array.from([0, 1, 2, 3, 250, 251, 252, 253, 9]));
    expect(code).toHaveLength(CODE_LENGTH);
    expect(isReferralCode(code)).toBe(true);
    expect(code).toMatch(/^[bcdfghjkmnpqrstvwxz2-9]+$/);
    expect(() => codeFromBytes(new Uint8Array(3))).toThrow();
  });

  it('refuses anything that is not a code', () => {
    for (const value of ['', 'abc', 'ABCDEFGH', 'abc def1', 'a'.repeat(13), null, 7, 'CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW']) {
      expect(isReferralCode(value)).toBe(false);
    }
  });

  it('builds the invite link on the site root', () => {
    expect(inviteLink('https://site.example/', 'bcdf2345')).toBe('https://site.example/?ref=bcdf2345');
  });
});

describe('claim', () => {
  it('accepts a fresh account arriving by somebody else code', () => {
    expect(claimVerdict(facts())).toBe('ok');
    expect(claimVerdict(facts({ callerCreatedAt: ago(CLAIM_WINDOW_MS) }))).toBe('ok');
  });

  it('refuses an unknown code, a self-referral, a second claim and an old account', () => {
    expect(claimVerdict(facts({ inviterId: null }))).toBe('unknown_code');
    expect(claimVerdict(facts({ inviterId: 'caller' }))).toBe('self_referral');
    expect(claimVerdict(facts({ alreadyClaimed: true }))).toBe('already_claimed');
    expect(claimVerdict(facts({ callerCreatedAt: ago(CLAIM_WINDOW_MS + 1) }))).toBe('account_too_old');
    expect(claimVerdict(facts({ callerCreatedAt: 'not a date' }))).toBe('account_too_old');
  });
});

describe('status', () => {
  it('counts pending and rewarded invites and names nobody', () => {
    const status = referralStatus('bcdf2345', 'https://site.example', [
      { status: 'rewarded', claimed_at: ago(9000), rewarded_at: ago(100) },
      { status: 'pending', claimed_at: ago(50), rewarded_at: null },
    ]);
    expect(status).toEqual({
      code: 'bcdf2345',
      link: 'https://site.example/?ref=bcdf2345',
      invited: [
        { status: 'rewarded', at: ago(100) },
        { status: 'pending', at: ago(50) },
      ],
      rewarded_count: 1,
      pending_count: 1,
    });
    expect(Object.keys(status.invited[0])).toEqual(['status', 'at']);
  });

  it('is empty for a learner who invited nobody', () => {
    expect(referralStatus('bcdf2345', 'https://site.example', [])).toMatchObject({ invited: [], rewarded_count: 0, pending_count: 0 });
  });
});
