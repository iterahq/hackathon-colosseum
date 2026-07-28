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
 *
 * ── Personal (PLG) tenants are NOT admin surfaces ──────────────────────────────
 * The auth-insert provisioning trigger (`itera.handle_new_federated_user`) creates
 * a PERSONAL billing tenant (`slug = 'plg-<uid>'`) with an `owner` membership for
 * self-serve signups. BUT that trigger fires on `auth.users` INSERT — BEFORE the
 * DFL federation code (`POST /v1/embed/session`) attaches the `dfl` identity +
 * dfl-batch learner membership — and a federated fellow is created by itera-api as
 * a plain `provider=email` auth user with NO `dfl_sub` yet. So the trigger CANNOT
 * tell a federated DFL learner from a genuine PLG signup at insert time, and it
 * mis-grants federated fellows a personal `plg-<uid>` OWNER tenant.
 *
 * A personal tenant is a billing container, NOT a professor/admin surface. Owning
 * one must never confer admin/host/paywall-exempt affordances in ANOTHER tenant
 * (e.g. dfl-batch) where the user is only a learner. Therefore every affordance
 * resolver below IGNORES personal-tenant memberships (`isPersonal`). This closes
 * the leak regardless of what the trigger does. A genuine solo PLG user still OWNS
 * their tenant (the membership is intact) — they just don't get a paywall bypass
 * (they must subscribe — that's the PLG model) nor a cohort-admin surface for a
 * tenant that has no cohort.
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
  /**
   * True when this is the user's PERSONAL auto-provisioned PLG tenant
   * (`slug = 'plg-<uid>'`). Personal-tenant memberships never confer
   * admin/host/paywall-exempt affordances. Defaults to `false`/undefined when the
   * tenant kind is unknown (synthetic/test rows) — treated as non-personal.
   */
  isPersonal?: boolean;
  /** Whether the tenant has the live-class feature enabled (`tenants.live_class_enabled`). */
  liveClassEnabled?: boolean;
  /** The tenant's slug (`itera.tenants.slug`), e.g. `dfl-batch`. */
  tenantSlug?: string;
  /**
   * The tenant's HUMAN name (`itera.tenants.name`), e.g. "DFL Batch". This is the
   * only correct thing to show a tenant-admin when naming the organisation whose
   * data they're looking at — the white-label BRAND name (useTenantBranding) is a
   * different axis and defaults to "Itera" for every tenant.
   */
  tenantName?: string;
}

/** Prefix the provisioning trigger uses for a user's PERSONAL PLG tenant slug. */
export const PERSONAL_TENANT_SLUG_PREFIX = 'plg-';

/** True when a tenant slug identifies a personal auto-provisioned PLG tenant. */
export function isPersonalTenantSlug(slug: string | null | undefined): boolean {
  return typeof slug === 'string' && slug.startsWith(PERSONAL_TENANT_SLUG_PREFIX);
}

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The current user's memberships (own rows only, per RLS). Empty when not
 * configured / not signed in / no membership.
 *
 * Embeds the tenant `slug` + `live_class_enabled` (via the
 * `memberships_tenant_id_fkey` FK; `itera.tenants` is public-read) so callers can
 * distinguish a PERSONAL PLG tenant (`plg-<uid>`) from a real/managed tenant. This
 * is what lets the affordance resolvers ignore a leaked personal-owner membership.
 *
 * Explicitly ORDERed (role, then tenant_id) so the row set is DETERMINISTIC.
 */
export async function getMyMemberships(): Promise<Membership[]> {
  if (!isSupabaseConfigured) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('memberships')
    .select('tenant_id, role, tenants(slug, name, live_class_enabled)')
    .order('role', { ascending: true })
    .order('tenant_id', { ascending: true });
  if (error) throw new Error(error.message);
  return asRows(data).map((r) => {
    // The embedded tenant may arrive as an object or a single-element array
    // depending on PostgREST's inference of the relationship cardinality.
    const t = Array.isArray(r.tenants)
      ? (r.tenants[0] as Row | undefined)
      : (r.tenants as Row | undefined);
    const slug = str(t?.slug);
    return {
      tenantId: str(r.tenant_id),
      role: str(r.role) as MemberRole,
      isPersonal: isPersonalTenantSlug(slug),
      liveClassEnabled: t?.live_class_enabled === true,
      tenantSlug: slug,
      tenantName: str(t?.name),
    };
  });
}

/** Admin/owner roles that (in a NON-personal tenant) may view the /admin surface. */
const ADMIN_ROLES: ReadonlySet<string> = new Set(['tenant_admin', 'owner']);

/** A membership that confers admin affordances: an admin/owner role in a NON-personal tenant. */
function isManagedAdminMembership(m: Membership): boolean {
  return ADMIN_ROLES.has(m.role) && !m.isPersonal;
}

/**
 * Every tenant the user administers, deterministically ordered (role priority —
 * owner before tenant_admin — then tenant_id lexical). Lets the /admin shell tell
 * a single-tenant admin from one who spans several, without the caller having to
 * re-derive the ordering the surface picks from.
 */
export function adminMemberships(memberships: Membership[]): Membership[] {
  // owner before tenant_admin — the same order `getMyMemberships` already returns
  // (`ORDER BY role, tenant_id`, and 'owner' < 'tenant_admin' lexically), so the
  // tenant the surface aggregates is unchanged; it's now explicit and holds for
  // synthetic/unordered arrays too.
  const priority: Record<string, number> = { owner: 0, tenant_admin: 1 };
  return (memberships ?? [])
    .filter(isManagedAdminMembership)
    .sort((a, b) => {
      const ra = priority[a.role] ?? 99;
      const rb = priority[b.role] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.tenantId.localeCompare(b.tenantId);
    });
}

/**
 * The single membership the /admin surface aggregates: the user's highest-ranked
 * administered tenant (deterministic — see `adminMemberships`). Returns the whole
 * membership (not just the id) so callers can LABEL the panel with the tenant
 * whose data they're actually showing.
 */
export function adminTenant(memberships: Membership[]): Membership | null {
  return adminMemberships(memberships)[0] ?? null;
}

/**
 * The tenant the user administers (highest-ranked tenant_admin/owner membership
 * in a NON-personal tenant). Returns null when the user administers no real
 * tenant. A personal `plg-<uid>` owner tenant is NOT an admin surface (see file
 * header).
 */
export function adminTenantId(memberships: Membership[]): string | null {
  return adminTenant(memberships)?.tenantId ?? null;
}

/**
 * True when the user holds a role that may view the /admin observability surface —
 * i.e. tenant_admin/owner of a REAL (non-personal) tenant. Owning only a personal
 * `plg-<uid>` billing tenant does NOT count (closes the federated-learner leak).
 */
export function isTenantAdmin(memberships: Membership[]): boolean {
  return memberships.some(isManagedAdminMembership);
}

/**
 * Roles that may use the `/author/*` review canvas. Mirrors the Itera RLS
 * function `itera.current_author_tenant_ids()` (author, instructor, tenant_admin,
 * owner) — the DB is the authority for the data; this is the app-layer belt.
 */
const AUTHOR_ROLES: ReadonlySet<string> = new Set([
  'author',
  'instructor',
  'tenant_admin',
  'owner',
]);

/**
 * True when the user may use the author surface — holds an author-capable role
 * (author/instructor/tenant_admin/owner) in a REAL (non-personal) tenant. A
 * leaked personal `plg-<uid>` owner does NOT qualify (same leak guard as
 * isTenantAdmin), so a federated dfl-batch learner never sees the authoring UI.
 */
export function canAuthor(memberships: Membership[]): boolean {
  return (memberships ?? []).some((m) => AUTHOR_ROLES.has(m.role) && !m.isPersonal);
}

/** Staff roles that may run a live class, in preference order (lower = preferred). */
const STAFF_ROLE_PRIORITY: Record<string, number> = {
  instructor: 0,
  tenant_admin: 1,
  owner: 2,
};

/**
 * A membership that may RUN a live class. Staff role AND the tenant is a real
 * teaching surface — either NON-personal, or a personal tenant that has explicitly
 * enabled live classes (a genuine solo PLG user hosting in their OWN tenant, once
 * `live_class_enabled` is turned on). A leaked personal `owner` tenant with live
 * classes disabled is EXCLUDED, so a federated dfl-batch learner never gets a host
 * affordance from it.
 */
function isStaffTeachingMembership(m: Membership): boolean {
  if (!(m.role in STAFF_ROLE_PRIORITY)) return false;
  if (m.isPersonal && m.liveClassEnabled !== true) return false;
  return true;
}

/**
 * The tenant the user may RUN a live class for. Returns null when the user holds
 * no qualifying staff membership. DETERMINISTIC selection:
 *   1. live-class-enabled tenants first (when `enabledTenantIds` is provided);
 *   2. then role priority (instructor > tenant_admin > owner);
 *   3. then tenant_id lexical order — a stable final tie-break.
 */
export function instructorTenantId(
  memberships: Membership[],
  opts?: { enabledTenantIds?: Iterable<string> }
): string | null {
  const list = instructorTenantIds(memberships, opts);
  return list.length > 0 ? list[0] : null;
}

/**
 * Every tenant the user may RUN a live class for (all qualifying staff
 * memberships, deterministically ordered). Enables a future tenant picker.
 */
export function instructorTenantIds(
  memberships: Membership[],
  opts?: { enabledTenantIds?: Iterable<string> }
): string[] {
  const enabled = opts?.enabledTenantIds ? new Set(opts.enabledTenantIds) : null;
  return memberships
    .filter(isStaffTeachingMembership)
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

/** True when the user may run a live class (holds a qualifying staff role). */
export function isInstructor(memberships: Membership[]): boolean {
  return instructorTenantId(memberships) !== null;
}

/**
 * Every role, most-privileged first. Drives the header role pill (loop-2 fix #5):
 * an instructor account must NOT read as "Aluno". Owner/tenant_admin/instructor
 * outrank author, which outranks learner.
 */
const ROLE_PRIORITY: Record<MemberRole, number> = {
  owner: 0,
  tenant_admin: 1,
  instructor: 2,
  author: 3,
  learner: 4,
};

/**
 * The user's HIGHEST-privilege role across their REAL (non-personal) memberships.
 * Personal `plg-<uid>` owner tenants are ignored so a federated dfl-batch learner
 * who was mis-granted a personal owner tenant still reads as "Aluno", not "Admin".
 * Defaults to `learner` when the user holds no real membership (safe floor).
 */
export function highestRole(memberships: Membership[]): MemberRole {
  const real = (memberships ?? []).filter((m) => !m.isPersonal);
  if (real.length === 0) return 'learner';
  return [...real].sort(
    (a, b) => (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99)
  )[0].role;
}
