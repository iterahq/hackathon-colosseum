import { describe, expect, it } from 'vitest';
import {
  generatedNameIn,
  isWalletUser,
  normalizeNickname,
  shouldShowNicknameGate,
  wasNicknameAsked,
} from './nicknameGate';

const wallet = { app_metadata: { provider: 'web3' }, identities: [] };
const emailUser = { app_metadata: { provider: 'email' }, identities: [{ provider: 'email' }] };
const address = { displayName: '6YWT…p2Gg' };

describe('shouldShowNicknameGate', () => {
  it('shows for a wallet user with an address-like name', () => {
    expect(shouldShowNicknameGate({ user: wallet as never, profile: address, skipped: false })).toBe(true);
  });
  it('shows for a wallet user with an empty name', () => {
    expect(shouldShowNicknameGate({ user: wallet as never, profile: { displayName: null }, skipped: false })).toBe(true);
  });
  it('hides once there is a real nickname', () => {
    expect(shouldShowNicknameGate({ user: wallet as never, profile: { displayName: 'Ana' }, skipped: false })).toBe(false);
  });
  it('hides for e-mail users', () => {
    expect(shouldShowNicknameGate({ user: emailUser as never, profile: address, skipped: false })).toBe(false);
  });
  it('hides when skipped or when the profile is unavailable', () => {
    expect(shouldShowNicknameGate({ user: wallet as never, profile: address, skipped: true })).toBe(false);
    expect(shouldShowNicknameGate({ user: wallet as never, profile: null, skipped: false })).toBe(false);
  });
  it('detects web3 through identities too', () => {
    expect(isWalletUser({ app_metadata: {}, identities: [{ provider: 'web3' }] } as never)).toBe(true);
  });
});

describe('normalizeNickname', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeNickname('  Ana   Maria ')).toEqual({ ok: true, value: 'Ana Maria' });
  });
  it('rejects empty, too short and too long values', () => {
    expect(normalizeNickname('   ')).toEqual({ ok: false, reason: 'length' });
    expect(normalizeNickname('a')).toEqual({ ok: false, reason: 'length' });
    expect(normalizeNickname('x'.repeat(25))).toEqual({ ok: false, reason: 'length' });
    expect(normalizeNickname('x'.repeat(24)).ok).toBe(true);
  });
  it('rejects e-mail lookalikes', () => {
    expect(normalizeNickname('me@site.io')).toEqual({ ok: false, reason: 'email' });
  });
});

describe('shouldShowNicknameGate, generated names', () => {
  it('asks a wallet user whose name is the generated "Tera <Word> <3 digits>"', () => {
    expect(shouldShowNicknameGate({ user: wallet as never, profile: { displayName: 'Tera Curioso 482' }, skipped: false })).toBe(true);
    expect(shouldShowNicknameGate({ user: wallet as never, profile: { displayName: 'Tera Curioso 482' }, skipped: true })).toBe(false);
    expect(shouldShowNicknameGate({ user: wallet as never, profile: { displayName: 'Marina' }, skipped: false })).toBe(false);
  });
});

describe('generatedNameIn', () => {
  it('translates the word of a generated name and keeps the number', () => {
    expect(generatedNameIn('Tera Ousado 477', 'en')).toBe('Tera Bold 477');
    expect(generatedNameIn('Tera Bold 477', 'pt')).toBe('Tera Ousado 477');
  });

  it('leaves alone a name already in that language and a name somebody chose', () => {
    expect(generatedNameIn('Tera Bold 477', 'en')).toBeNull();
    expect(generatedNameIn('Tera Ousado 477', 'pt')).toBeNull();
    expect(generatedNameIn('Marina', 'en')).toBeNull();
    expect(generatedNameIn('Tera Zzz 123', 'en')).toBeNull();
    expect(generatedNameIn(null, 'en')).toBeNull();
  });
});

describe('wasNicknameAsked', () => {
  it('reads the mark of the account', () => {
    expect(wasNicknameAsked({ user_metadata: { nickname_asked: true } } as never)).toBe(true);
    expect(wasNicknameAsked({ user_metadata: {} } as never)).toBe(false);
    expect(wasNicknameAsked(null)).toBe(false);
  });
});
