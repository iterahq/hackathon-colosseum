import { describe, it, expect } from 'vitest';
import {
  adminTenantId,
  isTenantAdmin,
  instructorTenantId,
  isInstructor,
  type Membership,
} from '@/services/membership.service';

const TA = '96786037-6c76-47e0-959d-359a5fe02d56';
const TB = '0618cad6-b829-4caf-9bae-c3932164383f';

describe('membership role helpers', () => {
  it('isTenantAdmin is true for tenant_admin / owner, false otherwise', () => {
    expect(isTenantAdmin([{ tenantId: TA, role: 'tenant_admin' }])).toBe(true);
    expect(isTenantAdmin([{ tenantId: TA, role: 'owner' }])).toBe(true);
    expect(isTenantAdmin([{ tenantId: TA, role: 'learner' }])).toBe(false);
    expect(isTenantAdmin([{ tenantId: TA, role: 'author' }])).toBe(false);
    expect(isTenantAdmin([])).toBe(false);
  });

  it('adminTenantId returns the tenant the user administers, else null', () => {
    const admin: Membership[] = [{ tenantId: TA, role: 'tenant_admin' }];
    expect(adminTenantId(admin)).toBe(TA);

    const learner: Membership[] = [{ tenantId: TB, role: 'learner' }];
    expect(adminTenantId(learner)).toBeNull();

    expect(adminTenantId([])).toBeNull();
  });

  it('a learner in tenant B is never an admin of tenant A (cross-tenant)', () => {
    const m: Membership[] = [{ tenantId: TB, role: 'learner' }];
    expect(isTenantAdmin(m)).toBe(false);
    expect(adminTenantId(m)).toBeNull();
  });

  it('instructorTenantId returns the tenant for instructor/tenant_admin/owner, else null', () => {
    // An instructor may run a live class (a learner may NOT).
    expect(instructorTenantId([{ tenantId: TA, role: 'instructor' }])).toBe(TA);
    expect(instructorTenantId([{ tenantId: TA, role: 'tenant_admin' }])).toBe(TA);
    expect(instructorTenantId([{ tenantId: TA, role: 'owner' }])).toBe(TA);
    expect(instructorTenantId([{ tenantId: TA, role: 'learner' }])).toBeNull();
    expect(instructorTenantId([{ tenantId: TA, role: 'author' }])).toBeNull();
    expect(instructorTenantId([])).toBeNull();
  });

  it('isInstructor mirrors instructorTenantId presence', () => {
    expect(isInstructor([{ tenantId: TA, role: 'instructor' }])).toBe(true);
    expect(isInstructor([{ tenantId: TB, role: 'learner' }])).toBe(false);
    expect(isInstructor([])).toBe(false);
  });
});
