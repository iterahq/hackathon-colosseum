import { describe, expect, it } from 'vitest';
import { activeNavOf, initialsOf, levelOf, shortAddress, walletOf } from './headerHud';

describe('levelOf', () => {
  it('starts at level 1 with nothing earned', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, span: 200, ratio: 0 });
  });
  it('maps 780 XP to level 4 with 180 earned inside it', () => {
    expect(levelOf(780)).toMatchObject({ level: 4, into: 180, ratio: 0.9 });
  });
  it('rolls into the next level exactly at the threshold', () => {
    expect(levelOf(200)).toMatchObject({ level: 2, into: 0 });
  });
  it('never goes below level 1', () => {
    expect(levelOf(-50).level).toBe(1);
  });
});

describe('shortAddress', () => {
  it('keeps head and tail with an ellipsis', () => {
    expect(shortAddress('7xKpQw9sLmN2vB4cR8tY1uZ3fQa')).toBe('7xKp…3fQa');
  });
  it('leaves short strings alone', () => {
    expect(shortAddress('abcdefgh')).toBe('abcdefgh');
  });
});

describe('walletOf', () => {
  const web3 = {
    id: '1',
    user_id: 'u',
    identity_id: 'i',
    provider: 'web3',
    created_at: '',
    last_sign_in_at: '',
    updated_at: '',
    identity_data: { custom_claims: { address: '7xKpQw9sLmN2vB4cR8tY1uZ3fQa', chain: 'solana', network: 'devnet' } },
  };
  it('reads the address, chain and network of a web3 identity', () => {
    expect(walletOf({ identities: [web3] })).toEqual({ address: '7xKpQw9sLmN2vB4cR8tY1uZ3fQa', chain: 'solana', network: 'devnet' });
  });
  it('returns null for an email user', () => {
    expect(walletOf({ identities: [{ ...web3, provider: 'email', identity_data: { email: 'a@b.c' } }] })).toBeNull();
    expect(walletOf(null)).toBeNull();
  });
});

describe('activeNavOf', () => {
  it('maps each learner route to its tab', () => {
    expect(activeNavOf('/')).toBe('trails');
    expect(activeNavOf('/catalog')).toBe('courses');
    expect(activeNavOf('/program/itera-v2')).toBe('courses');
    expect(activeNavOf('/course/react-do-zero')).toBe('courses');
    expect(activeNavOf('/passport')).toBe('passport');
    expect(activeNavOf('/artifacts/abc')).toBe('files');
  });
  it('owns nothing outside the learner area', () => {
    expect(activeNavOf('/profile')).toBeNull();
    expect(activeNavOf('/lesson/x')).toBeNull();
  });
});

describe('initialsOf', () => {
  it('takes the first two name parts', () => {
    expect(initialsOf('Samuel Demo')).toBe('SD');
    expect(initialsOf('ana.silva@x.com')).toBe('AS');
    expect(initialsOf('')).toBe('');
  });
});

describe('greetingName', () => {
  it('never greets with a wallet address', async () => {
    const { greetingName } = await import('@/utils/headerHud');
    expect(greetingName('Samuel')).toBe('Samuel');
    expect(greetingName('  ')).toBeNull();
    expect(greetingName(null)).toBeNull();
    expect(greetingName('CQzi…DAhW')).toBeNull();
    expect(greetingName('CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW')).toBeNull();
  });
});
