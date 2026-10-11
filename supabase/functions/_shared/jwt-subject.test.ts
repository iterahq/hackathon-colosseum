import { describe, expect, it } from 'vitest';
import { unverifiedSubject } from './jwt-subject.ts';

const encode = (payload: unknown) => Buffer.from(JSON.stringify(payload)).toString('base64url');
const token = (payload: unknown) => `${encode({ alg: 'ES256', typ: 'JWT' })}.${encode(payload)}.sig`;

describe('unverifiedSubject', () => {
  it('reads a uuid subject', () => {
    expect(unverifiedSubject(token({ sub: '0b836ee9-1b2c-4d5e-8f90-123456789abc', role: 'authenticated' }))).toBe('0b836ee9-1b2c-4d5e-8f90-123456789abc');
  });

  it('refuses anything that is not a uuid subject', () => {
    expect(unverifiedSubject(token({ sub: 'service_role' }))).toBeNull();
    expect(unverifiedSubject(token({ role: 'anon' }))).toBeNull();
    expect(unverifiedSubject(token({ sub: 42 }))).toBeNull();
  });

  it('refuses a malformed token', () => {
    expect(unverifiedSubject('')).toBeNull();
    expect(unverifiedSubject('a.b')).toBeNull();
    expect(unverifiedSubject('a.!!!.c')).toBeNull();
    expect(unverifiedSubject(`x.${Buffer.from('[1,2]').toString('base64url')}.y`)).toBeNull();
  });
});
