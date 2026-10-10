import { describe, expect, it } from 'vitest';
import { canEndorse, isStaffOf, isStaffRole, staffTenantIds } from './staff.ts';

const A = 'tenant-a';
const B = 'tenant-b';

describe('staff roles', () => {
  it('counts instructor, tenant_admin and owner, as the RLS helper does', () => {
    expect(['instructor', 'tenant_admin', 'owner'].every(isStaffRole)).toBe(true);
    expect(['learner', 'author', '', 'OWNER', 'admin'].some(isStaffRole)).toBe(false);
  });

  it('lists only the tenants where the role is a staff one', () => {
    expect(staffTenantIds([{ tenant_id: A, role: 'learner' }, { tenant_id: B, role: 'instructor' }, { tenant_id: B, role: 'owner' }])).toEqual([B]);
  });
});

describe('isStaffOf (class-podium)', () => {
  it('accepts an instructor or owner of the session tenant', () => {
    expect(isStaffOf([{ tenant_id: A, role: 'instructor' }], A)).toBe(true);
    expect(isStaffOf([{ tenant_id: A, role: 'owner' }], A)).toBe(true);
  });

  it('refuses a learner of that tenant', () => {
    expect(isStaffOf([{ tenant_id: A, role: 'learner' }], A)).toBe(false);
  });

  it('refuses an instructor of another tenant, even one who is a learner in this one', () => {
    expect(isStaffOf([{ tenant_id: B, role: 'instructor' }], A)).toBe(false);
    expect(isStaffOf([{ tenant_id: B, role: 'owner' }, { tenant_id: A, role: 'learner' }], A)).toBe(false);
  });

  it('refuses someone with no membership, and a missing tenant', () => {
    expect(isStaffOf([], A)).toBe(false);
    expect(isStaffOf([{ tenant_id: A, role: 'owner' }], null)).toBe(false);
    expect(isStaffOf([{ tenant_id: '', role: 'owner' }], '')).toBe(false);
  });
});

describe('canEndorse', () => {
  const teacher = { callerId: 'teacher', callerMemberships: [{ tenant_id: A, role: 'instructor' }] };
  const learner = { learnerId: 'learner', learnerMemberships: [{ tenant_id: A, role: 'learner' }] };

  it('lets a teacher endorse a learner of their tenant', () => {
    expect(canEndorse({ ...teacher, ...learner })).toEqual({ ok: true, tenantId: A });
  });

  it('refuses a self-endorsement, even by an owner', () => {
    expect(canEndorse({ callerId: 'x', learnerId: 'x', callerMemberships: [{ tenant_id: A, role: 'owner' }], learnerMemberships: [{ tenant_id: A, role: 'owner' }] })).toEqual({ ok: false, error: 'self_endorsement' });
  });

  it('refuses a learner endorsing a classmate', () => {
    expect(canEndorse({ callerId: 'peer', callerMemberships: [{ tenant_id: A, role: 'learner' }], ...learner })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('refuses an instructor of another tenant', () => {
    expect(canEndorse({ callerId: 'other', callerMemberships: [{ tenant_id: B, role: 'instructor' }], ...learner })).toEqual({ ok: false, error: 'forbidden' });
    expect(canEndorse({ callerId: 'other', callerMemberships: [{ tenant_id: B, role: 'owner' }, { tenant_id: A, role: 'learner' }], ...learner })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('refuses when the learner has no membership at all', () => {
    expect(canEndorse({ ...teacher, learnerId: 'ghost', learnerMemberships: [] })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('accepts when any of several tenants is shared', () => {
    expect(canEndorse({ callerId: 't', callerMemberships: [{ tenant_id: B, role: 'learner' }, { tenant_id: A, role: 'tenant_admin' }], ...learner })).toEqual({ ok: true, tenantId: A });
  });
});
