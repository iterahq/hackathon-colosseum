import { describe, expect, it } from 'vitest';
import { CLAIM_WINDOW_MS, CODE_LENGTH, REWARDS_LIFETIME, REWARDS_PER_DAY, asRewardSlot, claimVerdict, codeFromBytes, inviteLink, isReferralCode, referralNote, referralStatus, takeRewardSlot } from './referral';

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

describe('invite reward cap', () => {
  const INVITED = '0b0e1f7a-58e5-4f0c-9d55-7a1f6f1e2c3d';
  const rpcAnswering = (data: unknown, error: { message: string } | null = null) => {
    const calls: unknown[] = [];
    const rpc = (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      return Promise.resolve({ data, error });
    };
    return { rpc, calls };
  };

  it('caps at 5 rewards a day and 50 for ever, and passes exactly those to the slot function', async () => {
    expect(REWARDS_PER_DAY).toBe(5);
    expect(REWARDS_LIFETIME).toBe(50);
    const { rpc, calls } = rpcAnswering('ok');
    expect(await takeRewardSlot(rpc, INVITED)).toBe('ok');
    expect(calls).toEqual([['claim_referral_reward', { p_invited: INVITED, p_daily: 5, p_lifetime: 50 }]]);
  });

  it('reads `cap` and `none`, and never treats an unknown answer or an error as a slot', async () => {
    expect(await takeRewardSlot(rpcAnswering('cap').rpc, INVITED)).toBe('cap');
    expect(await takeRewardSlot(rpcAnswering('none').rpc, INVITED)).toBe('none');
    await expect(takeRewardSlot(rpcAnswering(null).rpc, INVITED)).rejects.toThrow('unexpected answer');
    await expect(takeRewardSlot(rpcAnswering('ok', { message: 'down' }).rpc, INVITED)).rejects.toThrow('down');
    expect(() => asRewardSlot('yes')).toThrow();
  });

  it('tells the invited learner only whether their own invite was rewarded', () => {
    expect(referralNote(null)).toBeNull();
    expect(referralNote({ rewarded: true })).toEqual({ rewarded: true });
    expect(referralNote({ rewarded: false })).toEqual({ rewarded: false, reason: 'cap' });
  });
});
