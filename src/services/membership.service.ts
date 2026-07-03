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
 *
 * Explicitly ORDERed (role, then tenant_id) so the row set is DETERMINISTIC —
 * PLG auto-creates a personal `owner` tenant per user (live_class_enabled=false),
 * so a real instructor can hold >1 staff membership. Without an order, the
 * "first staff membership" resolver (instructorTenantId) could non-deterministically
 * target the wrong tenant. (loop-1 fix #4.)
 */
export async function getMyMemberships(): Promise<Membership[]> {
  if (!isSupabaseConfigured) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('memberships')
    .select('tenant_id, role')
    .order('role', { ascending: true })
    .order('tenant_id', { ascending: true });
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

/** Staff roles that may run a live class, in preference order (lower = preferred). */
const STAFF_ROLE_PRIORITY: Record<string, number> = {
  instructor: 0,
  tenant_admin: 1,
  owner: 2,
};

/**
 * The tenant the user may RUN a live class for (a staff role —
 * instructor/tenant_admin/owner). Returns null when the user holds none.
 * This is the app-layer mirror of the migration's current_instructor_tenant_ids().
 *
 * DETERMINISTIC selection (loop-1 fix #4): PLG auto-creates a personal `owner`
 * tenant (live_class_enabled=false) per user, so a real instructor can qualify
 * in >1 tenant. To avoid targeting the wrong tenant, we pick by:
 *   1. live-class-enabled tenants first (when `enabledTenantIds` is provided) —
 *      the strongest signal that this is the real teaching tenant;
 *   2. then role priority (instructor > tenant_admin > owner) — the PLG personal
 *      tenant is `owner`, so a real instructor/admin membership wins;
 *   3. then tenant_id lexical order — a stable final tie-break.
 * When >1 tenant still qualifies at the top, the caller can surface a picker;
 * this function at minimum guarantees a stable, repeatable choice.
 */
export function instructorTenantId(
  memberships: Membership[],
  opts?: { enabledTenantIds?: Iterable<string> }
): string | null {
  const enabled = opts?.enabledTenantIds ? new Set(opts.enabledTenantIds) : null;
  const staff = memberships.filter((m) => m.role in STAFF_ROLE_PRIORITY);
  if (staff.length === 0) return null;

  const sorted = [...staff].sort((a, b) => {
    if (enabled) {
      const ea = enabled.has(a.tenantId) ? 0 : 1;
      const eb = enabled.has(b.tenantId) ? 0 : 1;
      if (ea !== eb) return ea - eb;
    }
    const ra = STAFF_ROLE_PRIORITY[a.role];
    const rb = STAFF_ROLE_PRIORITY[b.role];
    if (ra !== rb) return ra - rb;
    return a.tenantId.localeCompare(b.tenantId);
  });
  return sorted[0].tenantId;
}

/**
 * Every tenant the user may RUN a live class for (all staff memberships,
 * deterministically ordered). Enables a future tenant picker when >1 qualifies.
 */
export function instructorTenantIds(
  memberships: Membership[],
  opts?: { enabledTenantIds?: Iterable<string> }
): string[] {
  const enabled = opts?.enabledTenantIds ? new Set(opts.enabledTenantIds) : null;
  return memberships
    .filter((m) => m.role in STAFF_ROLE_PRIORITY)
    .sort((a, b) => {
      if (enabled) {
        const ea = enabled.has(a.tenantId) ? 0 : 1;
        const eb = enabled.has(b.tenantId) ? 0 : 1;
        if (ea !== eb) return ea - eb;
      }
      const ra = STAFF_ROLE_PRIORITY[a.role];
      const rb = STAFF_ROLE_PRIORITY[b.role];
      if (ra !== rb) return ra - rb;
      return a.tenantId.localeCompare(b.tenantId);
    })
    .map((m) => m.tenantId);
}

/** True when the user may run a live class (holds a staff role in some tenant). */
export function isInstructor(memberships: Membership[]): boolean {
  return instructorTenantId(memberships) !== null;
}
