import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAccessLevel } from './useAccessLevel';

const auth = vi.fn();
const entitlement = vi.fn();
const membership = vi.fn();

vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth() }));
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => entitlement() }));
vi.mock('@/hooks/useMembership', () => ({ useMembership: () => membership() }));

const signedIn = { session: { user: { id: 'u1' } }, loading: false, configured: true };
const learner = [{ tenantId: 'T', role: 'learner' }];

function level() {
  return renderHook(() => useAccessLevel()).result.current;
}

describe('useAccessLevel', () => {
  beforeEach(() => {
    auth.mockReturnValue(signedIn);
    membership.mockReturnValue({ data: learner, isPending: false });
    entitlement.mockReturnValue({ data: { active: false }, isPending: false, isError: false });
  });

  it('is pending while either read is in flight, never member', () => {
    entitlement.mockReturnValue({ data: undefined, isPending: true, isError: false });
    expect(level().level).toBe('pending');
  });

  it('is member with an active entitlement', () => {
    entitlement.mockReturnValue({ data: { active: true }, isPending: false, isError: false });
    expect(level().level).toBe('member');
  });

  it('is visitor without an active entitlement', () => {
    expect(level().level).toBe('visitor');
  });

  it('is visitor when the entitlement read failed, even with stale active data', () => {
    entitlement.mockReturnValue({ data: { active: true }, isPending: false, isError: true });
    expect(level()).toEqual({ level: 'visitor', entitlementError: true });
  });

  it('is member for a managed tenant admin regardless of entitlement', () => {
    membership.mockReturnValue({ data: [{ tenantId: 'T', role: 'owner' }], isPending: false });
    expect(level().level).toBe('member');
  });

  it('is member in unconfigured/mock mode, mirroring the gate pass-through', () => {
    auth.mockReturnValue({ session: null, loading: false, configured: false });
    expect(level().level).toBe('member');
  });
});
