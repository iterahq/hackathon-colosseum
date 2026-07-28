/**
 * Unit tests for the standalone "Sign in with DFL" entrypoint (forma 1).
 * Verifies the handoff redirect carries the correct return + next params.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('dflFederation.loginWithDfl', () => {
  const origAssign = window.location.assign;
  let assigned: string | null = null;

  beforeEach(() => {
    assigned = null;
    // jsdom: stub assign + origin
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'https://app.iterahq.dev',
        pathname: '/login',
        search: '',
        hash: '',
        assign: (u: string) => {
          assigned = u;
        },
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.location.assign = origAssign;
  });

  it('builds the handoff URL with return=callback and next', async () => {
    const { loginWithDfl, dflCallbackUrl } = await import('@/auth/dflFederation');
    expect(dflCallbackUrl()).toBe('https://app.iterahq.dev/auth/dfl/callback');
    loginWithDfl('/program/dfl-batch');
    expect(assigned).toBeTruthy();
    const u = new URL(assigned!);
    expect(u.searchParams.get('return')).toBe('https://app.iterahq.dev/auth/dfl/callback');
    expect(u.searchParams.get('next')).toBe('/program/dfl-batch');
  });
});
