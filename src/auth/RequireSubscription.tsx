/**
 * Subscription gate (PLG) — wraps the learner surfaces so only a user with an
 * ACTIVE subscription can reach the player. Behaviour:
 *   - unauthenticated  -> RequireAuth (upstream) already redirects to /login.
 *   - signed in, NO active subscription -> redirect to /subscribe.
 *   - signed in WITH active subscription -> render children.
 *   - tenant-admins/owners are EXEMPT (they manage a tenant; their access is
 *     role-driven, not seat-driven) — keeps the admin surface and B2B tenant
 *     members from being paywalled.
 *   - DFL-federated users are ENTITLED — DFL membership IS the subscription (D2).
 *     Detected via localStorage 'itera_dfl_session' flag set by exchangeDflToken.
 *   - Grandfathered users (created_at before VITE_SUBSCRIPTION_GATE_DATE, default
 *     '2026-07-06') are ENTITLED — existing free users keep access (D3).
 *
 * Entitlement is read from itera.my_subscription via useEntitlement (RLS-scoped
 * to the caller) — NOT a service-role query. App-layer half of belt+suspenders;
 * the DB view's WHERE clause is the authority.
 *
 * Plan: 20260624-itera-plg-subscribe-flow (Phase 3).
 */
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useMembership } from '@/hooks/useMembership';
import { isTenantAdmin } from '@/services/membership.service';

export function RequireSubscription({ children }: { children: ReactNode }) {
  const { session, loading: authLoading, configured, isDflFederated } = useAuth();
  const location = useLocation();
  const { data: entitlement, isPending: entPending } = useEntitlement();
  const { data: memberships, isPending: memPending } = useMembership();

  // Cutover date: users created before this date are grandfathered (D3).
  const GATE_DATE = new Date(
    (import.meta.env.VITE_SUBSCRIPTION_GATE_DATE as string | undefined) || '2026-07-06'
  );

  // In unconfigured/mock mode there is no entitlement data — let through so the
  // mock/dev path still renders (mirrors RequireAuth's mock pass-through).
  if (!configured) return <>{children}</>;

  if (authLoading || (session && (entPending || memPending))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  // Unauthenticated should already be caught by RequireAuth; defensively to login.
  if (!session) return <Navigate to="/login" replace />;

  // Tenant admins/owners are exempt from the seat paywall.
  if (isTenantAdmin(memberships ?? [])) return <>{children}</>;

  // DFL-federated users are entitled — DFL membership IS the subscription (D2).
  if (isDflFederated) return <>{children}</>;

  // Grandfather existing users: accounts created before the gate date keep access (D3).
  const accountCreatedAt = session?.user?.created_at ? new Date(session.user.created_at) : null;
  if (accountCreatedAt && accountCreatedAt < GATE_DATE) return <>{children}</>;

  if (!entitlement?.active) {
    return <Navigate to="/subscribe" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
