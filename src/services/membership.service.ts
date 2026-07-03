/**
 * Itera membership/role data layer.
 *
 * Resolves the signed-in user's Itera-local role + tenant from itera.memberships
 * (RLS `memberships_select_self` lets a user read their own membership rows).
 * This is the authority the `<RequireRole>` gate reads. It does NOT depend on the
 * custom-access-token JWT claim being enabled (the claim hook is belt; this query
 * is the suspenders) — plan ADR-7.
 *
 * Padrão do projeto: componente → hook (useQuery) → service → fetch. No React here.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

export type MemberRole =
  | 'learner'
  | 'instructor'
  | 'tenant_admin'
  | 'owner'
  | 'author';

export interface Membership {
  tenantId: string;
  role: MemberRole;
}

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The current user's memberships (own rows only, per RLS). Empty when not
 * configured / not signed in / no membership.
 */
export async function getMyMemberships(): Promise<Membership[]> {
  if (!isSupabaseConfigured) return [];
  const sb = getSupabase();
  const { data, error } = await sb.from('memberships').select('tenant_id, role');
  if (error) throw new Error(error.message);
  return asRows(data).map((r) => ({
    tenantId: str(r.tenant_id),
    role: str(r.role) as MemberRole,
  }));
}

/**
 * The tenant the user administers (first membership with role tenant_admin/owner).
 * Returns null when the user is not a tenant admin.
 */
export function adminTenantId(memberships: Membership[]): string | null {
  const m = memberships.find((x) => x.role === 'tenant_admin' || x.role === 'owner');
  return m ? m.tenantId : null;
}

/** True when the user holds a role that may view the /admin observability surface. */
export function isTenantAdmin(memberships: Membership[]): boolean {
  return memberships.some((m) => m.role === 'tenant_admin' || m.role === 'owner');
}

/**
 * The tenant the user may RUN a live class for (first membership with a staff
 * role — instructor/tenant_admin/owner). Returns null when the user holds none.
 * This is the app-layer mirror of the migration's current_instructor_tenant_ids().
 */
export function instructorTenantId(memberships: Membership[]): string | null {
  const m = memberships.find(
    (x) => x.role === 'instructor' || x.role === 'tenant_admin' || x.role === 'owner'
  );
  return m ? m.tenantId : null;
}

/** True when the user may run a live class (holds a staff role in some tenant). */
export function isInstructor(memberships: Membership[]): boolean {
  return instructorTenantId(memberships) !== null;
}
