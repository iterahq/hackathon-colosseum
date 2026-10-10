import { describe, expect, it } from 'vitest';
import { canEndorse, isPersonalTenantSlug, isStaffOf, isStaffRole, staffTenantIds } from './staff.ts';

const A = 'tenant-a';
const B = 'tenant-b';

describe('staff roles', () => {
  it('counts instructor, tenant_admin and owner, as the RLS helper does', () => {
    expect(['instructor', 'tenant_admin', 'owner'].every(isStaffRole)).toBe(true);
    expect(['learner', 'author', '', 'OWNER', 'admin'].some(isStaffRole)).toBe(false);
  });

  it('lists only the tenants where the role is a staff one', () => {
    expect(staffTenantIds([{ tenant_id: A, tenant_slug: 'school-a', role: 'learner' }, { tenant_id: B, tenant_slug: 'school-b', role: 'instructor' }, { tenant_id: B, tenant_slug: 'school-b', role: 'owner' }])).toEqual([B]);
  });
});

describe('isStaffOf (class-podium)', () => {
  it('accepts an instructor or owner of the session tenant', () => {
    expect(isStaffOf([{ tenant_id: A, tenant_slug: 'school-a', role: 'instructor' }], A)).toBe(true);
    expect(isStaffOf([{ tenant_id: A, tenant_slug: 'school-a', role: 'owner' }], A)).toBe(true);
  });

  it('refuses a learner of that tenant', () => {
    expect(isStaffOf([{ tenant_id: A, tenant_slug: 'school-a', role: 'learner' }], A)).toBe(false);
  });

  it('refuses an instructor of another tenant, even one who is a learner in this one', () => {
    expect(isStaffOf([{ tenant_id: B, tenant_slug: 'school-b', role: 'instructor' }], A)).toBe(false);
    expect(isStaffOf([{ tenant_id: B, tenant_slug: 'school-b', role: 'owner' }, { tenant_id: A, tenant_slug: 'school-a', role: 'learner' }], A)).toBe(false);
  });

  it('refuses someone with no membership, and a missing tenant', () => {
    expect(isStaffOf([], A)).toBe(false);
    expect(isStaffOf([{ tenant_id: A, tenant_slug: 'school-a', role: 'owner' }], null)).toBe(false);
    expect(isStaffOf([{ tenant_id: '', tenant_slug: 'x', role: 'owner' }], '')).toBe(false);
  });
});

describe('personal tenants confer nothing', () => {
  const P = 'tenant-personal';
  const personalOwner = [{ tenant_id: P, tenant_slug: 'plg-0123456789ab', role: 'owner' }];

  it('the owner of a personal tenant is not staff, there or anywhere', () => {
    expect(staffTenantIds(personalOwner)).toEqual([]);
    expect(isStaffOf(personalOwner, P)).toBe(false);
    expect(isPersonalTenantSlug('plg-0123456789ab')).toBe(true);
    expect(isPersonalTenantSlug('dfl-batch')).toBe(false);
  });

  it('cannot endorse a learner who was added to that personal tenant', () => {
    expect(canEndorse({ callerId: 'me', callerMemberships: personalOwner, learnerId: 'puppet', learnerMemberships: [{ tenant_id: P, tenant_slug: 'plg-0123456789ab', role: 'learner' }] })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('a membership whose tenant could not be read is never a staff membership', () => {
    expect(staffTenantIds([{ tenant_id: A, role: 'owner' }, { tenant_id: B, tenant_slug: null, role: 'instructor' }, { tenant_id: 'c', tenant_slug: '', role: 'owner' }])).toEqual([]);
  });

  it('a real school membership still counts next to a personal one', () => {
    expect(staffTenantIds([...personalOwner, { tenant_id: A, tenant_slug: 'school-a', role: 'instructor' }])).toEqual([A]);
  });
});

describe('canEndorse', () => {
  const teacher = { callerId: 'teacher', callerMemberships: [{ tenant_id: A, tenant_slug: 'school-a', role: 'instructor' }] };
  const learner = { learnerId: 'learner', learnerMemberships: [{ tenant_id: A, tenant_slug: 'school-a', role: 'learner' }] };

  it('lets a teacher endorse a learner of their tenant', () => {
    expect(canEndorse({ ...teacher, ...learner })).toEqual({ ok: true, tenantId: A });
  });

  it('refuses a self-endorsement, even by an owner', () => {
    expect(canEndorse({ callerId: 'x', learnerId: 'x', callerMemberships: [{ tenant_id: A, tenant_slug: 'school-a', role: 'owner' }], learnerMemberships: [{ tenant_id: A, tenant_slug: 'school-a', role: 'owner' }] })).toEqual({ ok: false, error: 'self_endorsement' });
  });

  it('refuses a learner endorsing a classmate', () => {
    expect(canEndorse({ callerId: 'peer', callerMemberships: [{ tenant_id: A, tenant_slug: 'school-a', role: 'learner' }], ...learner })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('refuses an instructor of another tenant', () => {
    expect(canEndorse({ callerId: 'other', callerMemberships: [{ tenant_id: B, tenant_slug: 'school-b', role: 'instructor' }], ...learner })).toEqual({ ok: false, error: 'forbidden' });
    expect(canEndorse({ callerId: 'other', callerMemberships: [{ tenant_id: B, tenant_slug: 'school-b', role: 'owner' }, { tenant_id: A, tenant_slug: 'school-a', role: 'learner' }], ...learner })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('refuses when the learner has no membership at all', () => {
    expect(canEndorse({ ...teacher, learnerId: 'ghost', learnerMemberships: [] })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('accepts when any of several tenants is shared', () => {
    expect(canEndorse({ callerId: 't', callerMemberships: [{ tenant_id: B, tenant_slug: 'school-b', role: 'learner' }, { tenant_id: A, tenant_slug: 'school-a', role: 'tenant_admin' }], ...learner })).toEqual({ ok: true, tenantId: A });
  });
});
