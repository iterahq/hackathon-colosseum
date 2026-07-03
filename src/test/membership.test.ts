import { describe, it, expect } from 'vitest';
import {
  adminTenantId,
  isTenantAdmin,
  instructorTenantId,
  instructorTenantIds,
  isInstructor,
  highestRole,
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

// loop-1 fix #4 — deterministic instructor-tenant resolution.
describe('instructorTenantId determinism (multiple staff memberships)', () => {
  const DFL = 'dfl-batch-tenant';
  const PERSONAL = 'personal-plg-tenant';

  it('prefers a live-class-enabled tenant over a non-enabled personal owner tenant', () => {
    // The PLG shape: a real instructor in dfl-batch PLUS an auto-created personal
    // `owner` tenant. Even though `owner` is a staff role, the enabled tenant wins.
    const memberships: Membership[] = [
      { tenantId: PERSONAL, role: 'owner' },
      { tenantId: DFL, role: 'instructor' },
    ];
    expect(
      instructorTenantId(memberships, { enabledTenantIds: [DFL] })
    ).toBe(DFL);
  });

  it('still prefers the enabled tenant regardless of membership row order', () => {
    const memberships: Membership[] = [
      { tenantId: DFL, role: 'instructor' },
      { tenantId: PERSONAL, role: 'owner' },
    ];
    expect(instructorTenantId(memberships, { enabledTenantIds: [DFL] })).toBe(DFL);
  });

  it('falls back to role priority (instructor > owner) when no enabled set is given', () => {
    const memberships: Membership[] = [
      { tenantId: PERSONAL, role: 'owner' },
      { tenantId: DFL, role: 'instructor' },
    ];
    expect(instructorTenantId(memberships)).toBe(DFL);
  });

  it('is deterministic for two same-role tenants (lexical tenantId tie-break)', () => {
    const A = 'aaaa-tenant';
    const B = 'bbbb-tenant';
    const order1: Membership[] = [
      { tenantId: B, role: 'instructor' },
      { tenantId: A, role: 'instructor' },
    ];
    const order2: Membership[] = [
      { tenantId: A, role: 'instructor' },
      { tenantId: B, role: 'instructor' },
    ];
    expect(instructorTenantId(order1)).toBe(A);
    expect(instructorTenantId(order2)).toBe(A);
  });

  it('does not mutate the input array', () => {
    const memberships: Membership[] = [
      { tenantId: PERSONAL, role: 'owner' },
      { tenantId: DFL, role: 'instructor' },
    ];
    const snapshot = memberships.map((m) => m.tenantId);
    instructorTenantId(memberships, { enabledTenantIds: [DFL] });
    expect(memberships.map((m) => m.tenantId)).toEqual(snapshot);
  });

  it('instructorTenantIds returns all staff tenants, enabled-first then role priority', () => {
    const memberships: Membership[] = [
      { tenantId: PERSONAL, role: 'owner' },
      { tenantId: DFL, role: 'instructor' },
      { tenantId: 'learner-tenant', role: 'learner' },
    ];
    expect(
      instructorTenantIds(memberships, { enabledTenantIds: [DFL] })
    ).toEqual([DFL, PERSONAL]);
    // learner tenant is never included.
    expect(instructorTenantIds(memberships)).not.toContain('learner-tenant');
  });
});

// loop-2 fix #5 — header role pill reflects highest-privilege role.
describe('highestRole (role pill)', () => {
  it('defaults to learner with no memberships', () => {
    expect(highestRole([])).toBe('learner');
  });

  it('returns instructor for an instructor account (NOT learner — the bug)', () => {
    expect(highestRole([{ tenantId: TA, role: 'instructor' }])).toBe('instructor');
  });

  it('owner/tenant_admin outrank instructor which outranks author/learner', () => {
    expect(
      highestRole([
        { tenantId: TA, role: 'learner' },
        { tenantId: TB, role: 'instructor' },
      ])
    ).toBe('instructor');
    expect(
      highestRole([
        { tenantId: TA, role: 'instructor' },
        { tenantId: TB, role: 'tenant_admin' },
      ])
    ).toBe('tenant_admin');
    expect(
      highestRole([
        { tenantId: TA, role: 'tenant_admin' },
        { tenantId: TB, role: 'owner' },
      ])
    ).toBe('owner');
    expect(
      highestRole([
        { tenantId: TA, role: 'author' },
        { tenantId: TB, role: 'learner' },
      ])
    ).toBe('author');
  });

  it('a pure learner reads as learner', () => {
    expect(highestRole([{ tenantId: TA, role: 'learner' }])).toBe('learner');
  });

  it('is order-independent', () => {
    const a: Membership[] = [
      { tenantId: TA, role: 'owner' },
      { tenantId: TB, role: 'learner' },
    ];
    const b: Membership[] = [
      { tenantId: TB, role: 'learner' },
      { tenantId: TA, role: 'owner' },
    ];
    expect(highestRole(a)).toBe(highestRole(b));
    expect(highestRole(a)).toBe('owner');
  });
});
