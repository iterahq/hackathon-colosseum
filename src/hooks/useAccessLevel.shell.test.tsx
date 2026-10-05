import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ShellSurface } from '@/lib/shellSurface';
import { useAccessLevel } from './useAccessLevel';

const surface = vi.hoisted(() => ({ value: 'web' as ShellSurface }));
const entitlement = vi.hoisted(() => ({ data: { active: true } as { active: boolean } | undefined, isPending: false, isError: true }));
vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => surface.value }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } }, loading: false, configured: true }) }));
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => entitlement }));
vi.mock('@/hooks/useMembership', () => ({ useMembership: () => ({ data: [{ tenantId: 'T', role: 'learner' }], isPending: false }) }));

describe('useAccessLevel on a failed read after an "entitled" answer', () => {
  beforeEach(() => {
    entitlement.data = { active: true };
  });

  it.each(['web', 'pending'] as const)('surface %s: visitor, as before', (value) => {
    surface.value = value;
    expect(renderHook(() => useAccessLevel()).result.current).toEqual({ level: 'visitor', entitlementError: true });
  });

  it('inside the shell: member, so the page agrees with the gate', () => {
    surface.value = 'shell';
    expect(renderHook(() => useAccessLevel()).result.current).toEqual({ level: 'member', entitlementError: true });
  });

  it('inside the shell with no earlier answer: visitor', () => {
    surface.value = 'shell';
    entitlement.data = undefined;
    expect(renderHook(() => useAccessLevel()).result.current.level).toBe('visitor');
  });
});
