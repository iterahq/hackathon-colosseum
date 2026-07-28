import { describe, it, expect } from 'vitest';
import { generateGuestCode, isValidGuestCode, GUEST_CODE_ALPHABET } from '@/utils/guestCode';
import { guestLinkFor, isGuestRoutePath, GUEST_ROUTE_PATH } from '@/guest/guestRoute';

/**
 * The guest code is read aloud on a call and retyped from a screenshot — the
 * ambiguous-glyph exclusions are the point of the alphabet, not a nicety
 * (plan 20260728-itera-guest-link-aula-sincrona, ADR-5).
 */
describe('guest code', () => {
  it('excludes every ambiguous glyph (0/O, 1/l/I) and all lowercase', () => {
    for (const bad of ['0', 'O', '1', 'l', 'I']) {
      expect(GUEST_CODE_ALPHABET).not.toContain(bad);
    }
    expect(GUEST_CODE_ALPHABET).toBe(GUEST_CODE_ALPHABET.toUpperCase());
  });

  it('generates 8 URL-safe chars drawn only from the alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateGuestCode();
      expect(code).toHaveLength(8);
      for (const ch of code) expect(GUEST_CODE_ALPHABET).toContain(ch);
      expect(encodeURIComponent(code)).toBe(code);
    }
  });

  it('does not repeat itself across calls', () => {
    const codes = new Set(Array.from({ length: 40 }, () => generateGuestCode()));
    expect(codes.size).toBeGreaterThan(35);
  });

  it('rejects obviously-malformed codes without a network round-trip', () => {
    expect(isValidGuestCode(generateGuestCode())).toBe(true);
    expect(isValidGuestCode('')).toBe(false);
    expect(isValidGuestCode(undefined)).toBe(false);
    expect(isValidGuestCode('ab')).toBe(false);
    expect(isValidGuestCode('has space')).toBe(false);
    expect(isValidGuestCode('slash/injected')).toBe(false);
  });
});

describe('guest route contract', () => {
  it('builds the shareable link the professor copies', () => {
    expect(guestLinkFor('https://app.iterahq.dev', 'ABCD2345')).toBe(
      'https://app.iterahq.dev/g/ABCD2345'
    );
    // A trailing slash on the origin must not double up.
    expect(guestLinkFor('https://app.iterahq.dev/', 'ABCD2345')).toBe(
      'https://app.iterahq.dev/g/ABCD2345'
    );
  });

  it('recognises the guest surface and nothing else', () => {
    expect(GUEST_ROUTE_PATH).toBe('/g/:code');
    expect(isGuestRoutePath('/g/ABCD2345')).toBe(true);
    expect(isGuestRoutePath('/g')).toBe(true);
    // Not the guest surface — these must keep their app-wide mounts.
    expect(isGuestRoutePath('/')).toBe(false);
    expect(isGuestRoutePath('/live/abc')).toBe(false);
    expect(isGuestRoutePath('/games')).toBe(false);
    expect(isGuestRoutePath(undefined)).toBe(false);
  });
});
