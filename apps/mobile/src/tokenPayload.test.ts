import { describe, expect, it } from 'vitest';
import { fakeJwt } from './jwt.testkit';
import { UUID, jwtPayload } from './tokenPayload';

const part = (value: unknown) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8').toString('base64url');

describe('jwtPayload', () => {
  it('reads the payload of a token as an object', () => {
    expect(jwtPayload(fakeJwt({ role: 'anon', sub: 'x' }))).toMatchObject({ role: 'anon', sub: 'x', aud: 'authenticated' });
  });

  it('reads base64url with the - and _ alphabet and no padding', () => {
    const claims = { note: '>>>???~~~' };
    expect(part(claims)).toMatch(/[-_]/);
    expect(jwtPayload(`h.${part(claims)}.s`)).toEqual(claims);
  });

  it('reads one character per byte: ASCII claims are exact, an accent is not', () => {
    const claims = jwtPayload(fakeJwt({ name: 'João' }));
    expect(claims?.sub).toBeDefined();
    expect(claims?.name).not.toBe('João');
  });

  it.each([
    ['no payload part', 'header-only'],
    ['an empty payload part', 'h..s'],
    ['a payload part of impossible length', 'h.abcde.s'],
    ['characters outside base64url', 'h.%%%%.s'],
    ['a payload that is not JSON', `h.${part('not json')}.s`],
    ['a JSON array', `h.${part([1, 2])}.s`],
    ['a JSON number', `h.${part(7)}.s`],
    ['JSON null', `h.${part('null')}.s`],
    ['an opaque key', 'sb_publishable_abcdef'],
    ['an empty string', ''],
  ])('is null for %s', (_what, token) => {
    expect(jwtPayload(token)).toBeNull();
  });
});

describe('UUID', () => {
  it('accepts a UUID in any case', () => {
    expect(UUID.test('5b0f7c3e-2f4d-4c1a-9d53-8a6f2b1c0e77')).toBe(true);
    expect(UUID.test('5B0F7C3E-2F4D-4C1A-9D53-8A6F2B1C0E77')).toBe(true);
  });

  it.each(['', 'x', '5b0f7c3e-2f4d-4c1a-9d53-8a6f2b1c0e7', '5b0f7c3e-2f4d-4c1a-9d53-8a6f2b1c0e777', ' 5b0f7c3e-2f4d-4c1a-9d53-8a6f2b1c0e77', '5b0f7c3e2f4d4c1a9d538a6f2b1c0e77', '5b0f7c3e-2f4d-4c1a-9d53-8a6f2b1c0e7g'])('rejects %j', (value) => {
    expect(UUID.test(value)).toBe(false);
  });
});
