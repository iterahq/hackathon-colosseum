/** Test-only: an unsigned token of the shape a Supabase access token has. Not a secret, not a real session. */
export const PROJECT = 'https://kjefmwlopzeaqgqtlbdn.supabase.co';
export const ISSUER = `${PROJECT}/auth/v1`;
export const USER = '5b0f7c3e-2f4d-4c1a-9d53-8a6f2b1c0e77';
export const OTHER_USER = '0d9c1a52-77aa-4b0e-8f11-3c2e9d4a6b10';

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

export function fakeJwt(claims: Record<string, unknown> = {}, signature = 'c2lnbmF0dXJlLW5vdC1yZWFs'): string {
  const payload = {
    iss: ISSUER,
    aud: 'authenticated',
    role: 'authenticated',
    sub: USER,
    exp: 2_000_000_000,
    iat: 1_999_996_400,
    email: 'aluna@example.com',
    app_metadata: { provider: 'email' },
    user_metadata: { name: 'João Ação' },
    ...claims,
  };
  return `${b64url({ alg: 'ES256', typ: 'JWT', kid: 'k1' })}.${b64url(payload)}.${signature}`;
}

/** Before the default `exp` of `fakeJwt` (2_000_000_000 s). */
export const NOW = 1_999_999_000_000;
