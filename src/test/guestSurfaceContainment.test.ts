import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { findStoredGuestCode, isGuestAccessToken } from '@/services/guestSession.service';

/**
 * Keeping a guest ON the guest surface.
 *
 * A link-invited guest holds a REAL Supabase session, so every authenticated
 * route used to let them in and then bounce them to /subscribe — app chrome and
 * a price tag, shown to the very prospect the guest link exists to impress. No
 * data leaked there (zero memberships means RLS returns nothing), but it was the
 * wrong screen at the worst possible moment.
 */

function jwtWith(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

describe('isGuestAccessToken', () => {
  it('recognises a guest token by the app_metadata.is_guest claim', () => {
    expect(isGuestAccessToken(jwtWith({ app_metadata: { is_guest: true } }))).toBe(true);
  });

  it('does NOT treat an ordinary learner token as a guest', () => {
    expect(isGuestAccessToken(jwtWith({ app_metadata: { provider: 'email' } }))).toBe(false);
    expect(isGuestAccessToken(jwtWith({ app_metadata: { is_guest: false } }))).toBe(false);
  });

  it('is false for junk rather than throwing (it only picks a screen)', () => {
    expect(isGuestAccessToken(undefined)).toBe(false);
    expect(isGuestAccessToken('')).toBe(false);
    expect(isGuestAccessToken('not-a-jwt')).toBe(false);
    expect(isGuestAccessToken('a.b')).toBe(false);
  });

  it('ignores a truthy-but-not-true claim (no string coercion)', () => {
    expect(isGuestAccessToken(jwtWith({ app_metadata: { is_guest: 'true' } }))).toBe(false);
  });
});

describe('findStoredGuestCode', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('returns null when this browser never joined as a guest', () => {
    expect(findStoredGuestCode()).toBeNull();
  });

  it('finds the code of a stored guest session', () => {
    localStorage.setItem(
      'itera.guest.ABCD2345',
      JSON.stringify({ sessionId: 's1', iteraUserId: 'u1', displayName: 'Ana', avatarUrl: null })
    );
    expect(findStoredGuestCode()).toBe('ABCD2345');
  });

  it('ignores unrelated localStorage keys', () => {
    localStorage.setItem('sb-auth-token', 'x');
    localStorage.setItem('itera_dfl_session', '1');
    expect(findStoredGuestCode()).toBeNull();
  });

  it('ignores a malformed guest entry instead of returning a broken code', () => {
    localStorage.setItem('itera.guest.BROKEN01', '{not json');
    expect(findStoredGuestCode()).toBeNull();
  });
});
