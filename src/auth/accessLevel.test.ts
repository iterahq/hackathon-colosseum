import { describe, it, expect } from 'vitest';
import { hasPaidAccess } from './accessLevel';

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
