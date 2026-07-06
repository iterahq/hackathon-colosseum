/**
 * Role gate for the tenant-admin observability surface (plan ADR-1/3).
 *
 * Wraps a route so ONLY a user whose itera.memberships role is tenant_admin
 * (or owner) can render it. Behaviour:
 *   - unauthenticated  -> RequireAuth (upstream) already redirects to /login.
 *   - signed in, NOT an admin (e.g. a learner) -> redirect to "/" (V5).
 *   - signed in AND admin -> render children.
 *
 * The role is read from itera.memberships via useMembership (RLS-scoped to the
 * caller's own rows) — NOT from a service-role query. This is the app-layer half
 * of the belt+suspenders; the DB RLS policies are the authority for the data.
 */
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useMembership } from '@/hooks/useMembership';
import { isTenantAdmin, canAuthor, type MemberRole } from '@/services/membership.service';

export function RequireRole({
  role = 'tenant_admin',
  children,
  fallback = '/',
}: {
  role?: MemberRole;
  children: ReactNode;
  fallback?: string;
}) {
  const { session, loading: authLoading, configured } = useAuth();
  const { data: memberships, isPending } = useMembership();

  // In unconfigured/mock mode there is no role data — deny the admin surface
  // (it is meaningless without live data) rather than leak it open.
  if (!configured) return <Navigate to={fallback} replace />;

  if (authLoading || (session && isPending)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  // Unauthenticated should already be caught by RequireAuth; defensively send to login.
  if (!session) return <Navigate to="/login" replace />;

  // `author` is not a single-role check: authors AND instructors (+ admins/owners)
  // qualify — mirrors itera.current_author_tenant_ids() (the DB RLS authority).
  const allowed =
    role === 'tenant_admin'
      ? isTenantAdmin(memberships ?? [])
      : role === 'author'
        ? canAuthor(memberships ?? [])
        : (memberships ?? []).some((m) => m.role === role);

  if (!allowed) return <Navigate to={fallback} replace />;

  return <>{children}</>;
}
