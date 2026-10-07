import { describe, it, expect } from 'vitest';
import { accessVerdict, hasPaidAccess, type AccessVerdictInput } from './accessLevel';

describe('hasPaidAccess', () => {
  it('is false with no memberships and no entitlement', () => {
    expect(hasPaidAccess({ memberships: [], entitlement: undefined })).toBe(false);
  });

  it('is true when the entitlement is active', () => {
    expect(
      hasPaidAccess({
        memberships: [{ tenantId: 'T', role: 'learner' }],
        entitlement: { active: true },
      })
    ).toBe(true);
  });

  it('is false when the entitlement is explicitly inactive', () => {
    expect(
      hasPaidAccess({
        memberships: [{ tenantId: 'T', role: 'learner' }],
        entitlement: { active: false },
      })
    ).toBe(false);
  });

  it('is true for a tenant_admin even without an active entitlement', () => {
    expect(
      hasPaidAccess({
        memberships: [{ tenantId: 'T', role: 'tenant_admin' }],
        entitlement: { active: false },
      })
    ).toBe(true);
  });

  it('is true for an owner of a REAL (non-personal) tenant', () => {
    expect(
      hasPaidAccess({
        memberships: [{ tenantId: 'T', role: 'owner', isPersonal: false }],
        entitlement: undefined,
      })
    ).toBe(true);
  });

  it('does NOT exempt an owner of a personal plg tenant (leak closed upstream)', () => {
    expect(
      hasPaidAccess({
        memberships: [{ tenantId: 'plg-u1', role: 'owner', isPersonal: true }],
        entitlement: { active: false },
      })
    ).toBe(false);
  });

  it('is false when entitlement is undefined (e.g. a failed/pending read) and no admin role', () => {
    expect(
      hasPaidAccess({
        memberships: [{ tenantId: 'T', role: 'learner' }],
        entitlement: undefined,
      })
    ).toBe(false);
  });

  it('a stale active entitlement does not survive a failed refetch', () => {
    expect(
      hasPaidAccess({
        memberships: [{ tenantId: 'T', role: 'learner' }],
        entitlement: { active: true },
        entitlementError: true,
      })
    ).toBe(false);
  });

  it('a managed tenant admin keeps access even when the entitlement read fails', () => {
    expect(
      hasPaidAccess({
        memberships: [{ tenantId: 'T', role: 'tenant_admin' }],
        entitlement: undefined,
        entitlementError: true,
      })
    ).toBe(true);
  });
});

const base: AccessVerdictInput = {
  configured: true,
  authLoading: false,
  hasSession: true,
  entitlementPending: false,
  membershipPending: false,
  memberships: [{ tenantId: 'T', role: 'learner' }] as AccessVerdictInput['memberships'],
  entitlement: { active: false },
  entitlementError: false,
  surface: 'web',
};
const verdict = (over: Partial<AccessVerdictInput>) => accessVerdict({ ...base, ...over });

describe('accessVerdict', () => {
  it('unconfigured wins over everything else', () => {
    expect(verdict({ configured: false, authLoading: true, hasSession: false })).toEqual({ kind: 'unconfigured' });
  });

  it.each([
    ['auth loading', { authLoading: true }],
    ['entitlement pending', { entitlementPending: true }],
    ['membership pending', { membershipPending: true }],
  ])('pending while %s', (_n, over) => {
    expect(verdict(over)).toEqual({ kind: 'pending', unreachableInShell: false });
  });

  it('pending with no session only while auth loads', () => {
    expect(verdict({ hasSession: false, entitlementPending: true })).toEqual({ kind: 'signed-out' });
    expect(verdict({ hasSession: false, authLoading: true })).toEqual({ kind: 'pending', unreachableInShell: false });
  });

  it('flags an unreachable read only for a signed-in user inside the shell', () => {
    const pending = { entitlementPending: true, entitlementUnreachable: true };
    expect(verdict({ ...pending, surface: 'shell' })).toEqual({ kind: 'pending', unreachableInShell: true });
    expect(verdict({ ...pending, surface: 'web' })).toEqual({ kind: 'pending', unreachableInShell: false });
    expect(verdict({ ...pending, surface: 'pending' })).toEqual({ kind: 'pending', unreachableInShell: false });
    expect(verdict({ ...pending, surface: 'shell', hasSession: false, authLoading: true })).toEqual({ kind: 'pending', unreachableInShell: false });
  });

  it('signed-out without a session', () => {
    expect(verdict({ hasSession: false })).toEqual({ kind: 'signed-out' });
  });

  it('paid with an active entitlement, or as a tenant admin', () => {
    expect(verdict({ entitlement: { active: true } })).toEqual({ kind: 'paid' });
    expect(verdict({ memberships: [{ tenantId: 'T', role: 'owner' }] as AccessVerdictInput['memberships'] })).toEqual({ kind: 'paid' });
    expect(verdict({ memberships: [{ tenantId: 'T', role: 'owner' }] as AccessVerdictInput['memberships'], entitlementError: true, entitlement: undefined })).toEqual({ kind: 'paid' });
  });

  it.each(['web', 'pending', 'shell'] as const)('no-access on surface %s carries the surface', (surface) => {
    expect(verdict({ surface })).toEqual({ kind: 'no-access', surface });
    expect(verdict({ surface, entitlement: undefined })).toEqual({ kind: 'no-access', surface });
  });

  it('keeps the page after a failed read that follows an entitled answer, in the shell only', () => {
    const failed = { entitlementError: true, entitlement: { active: true } };
    expect(verdict({ ...failed, surface: 'shell' })).toEqual({ kind: 'kept-after-failed-read' });
    expect(verdict({ ...failed, surface: 'web' })).toEqual({ kind: 'read-failed', surface: 'web' });
    expect(verdict({ ...failed, surface: 'pending' })).toEqual({ kind: 'read-failed', surface: 'pending' });
  });

  it.each([undefined, { active: false }])('a failed read without an earlier entitled answer (%j) is read-failed', (entitlement) => {
    expect(verdict({ entitlementError: true, entitlement, surface: 'shell' })).toEqual({ kind: 'read-failed', surface: 'shell' });
  });
});
