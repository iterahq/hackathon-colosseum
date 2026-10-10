/**
 * Who may act as a teacher. Mirrors `itera.current_instructor_tenant_ids()`,
 * the rule the app's RLS applies to live classes: a membership with one of
 * these roles, in the tenant the action is about. Roles come from
 * `itera.memberships` for the user behind the verified token, never from a request.
 */
export const STAFF_ROLES = ['instructor', 'tenant_admin', 'owner'] as const;

export interface Membership {
  tenant_id: string;
  role: string;
}

export function isStaffRole(role: string): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function staffTenantIds(memberships: readonly Membership[]): string[] {
  return [...new Set(memberships.filter((membership) => isStaffRole(membership.role)).map((membership) => membership.tenant_id))];
}

/** True when the caller teaches or owns the given tenant. */
export function isStaffOf(memberships: readonly Membership[], tenantId: string | null | undefined): boolean {
  return typeof tenantId === 'string' && tenantId.length > 0 && staffTenantIds(memberships).includes(tenantId);
}

export type EndorseRefusal = 'self_endorsement' | 'forbidden';

/**
 * An endorsement needs a teacher of a tenant the learner belongs to (any role
 * there), and nobody vouches for their own certification.
 */
export function canEndorse(facts: {
  callerId: string;
  learnerId: string;
  callerMemberships: readonly Membership[];
  learnerMemberships: readonly Membership[];
}): { ok: true; tenantId: string } | { ok: false; error: EndorseRefusal } {
  if (facts.callerId === facts.learnerId) return { ok: false, error: 'self_endorsement' };
  const learnerTenants = new Set(facts.learnerMemberships.map((membership) => membership.tenant_id));
  const shared = staffTenantIds(facts.callerMemberships).find((tenantId) => learnerTenants.has(tenantId));
  return shared ? { ok: true, tenantId: shared } : { ok: false, error: 'forbidden' };
}
