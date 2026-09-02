/**
 * Subscription gate (PLG) — wraps the learner surfaces so only a user with an
 * ACTIVE subscription can reach the player. Behaviour:
 *   - unauthenticated  -> RequireAuth (upstream) already redirects to /login.
 *   - signed in, NO active subscription -> redirect to /subscribe.
 *   - signed in WITH active subscription -> render children.
 *   - tenant-admins/owners are EXEMPT (they manage a tenant; their access is
 *     role-driven, not seat-driven) — keeps the admin surface and B2B tenant
 *     members from being paywalled.
 *   - `graceOnError` (opt-in, hoje só a aula ao vivo) deixa passar quando a
 *     leitura de entitlement FALHA; ver o comentário no check.
 *
 * Entitlement is read from itera.my_subscription via useEntitlement (RLS-scoped
 * to the caller) — NOT a service-role query. App-layer half of belt+suspenders;
 * the DB view's WHERE clause is the authority.
 *
 * ⚠️ TODA isenção mora naquele WHERE, nunca aqui. As três que existem —
 * assinatura paga, tenant isento (`status='exempt'`, db/migrations/0055) e
 * conta anterior ao paywall (`status='grandfathered'`, db/migrations/0075) —
 * chegam como uma linha `is_active` pela MESMA leitura. Isenção nova é
 * migration, não um `if` novo neste arquivo: um ramo aqui só pode ser decidido
 * por dado que o cliente controla, e um cliente que decide o próprio paywall
 * não tem paywall.
 *
 * Plan: 20260624-itera-plg-subscribe-flow (Phase 3).
 */
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useMembership } from '@/hooks/useMembership';
import { isTenantAdmin } from '@/services/membership.service';

export function RequireSubscription({
  children,
  graceOnError = false,
}: {
  children: ReactNode;
  graceOnError?: boolean;
}) {
  const { session, loading: authLoading, configured } = useAuth();
  const location = useLocation();
  const { data: entitlement, isPending: entPending, isError: entError } = useEntitlement();
  const { data: memberships, isPending: memPending } = useMembership();

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

  // Uma leitura que FALHOU não é uma resposta — é a ausência dela. Só a aula ao
  // vivo escolhe passar nesse caso (`graceOnError`): ela roda no mesmo wifi de
  // escola em que a query morre, e derrubar o aluno no meio da aula custa uma
  // aula real. Nas outras superfícies pagas o mesmo comportamento seria bypass
  // permanente para quem bloqueia a request de propósito, então elas paywallam.
  // Um "sem assinatura" definitivo paywalla em qualquer caso.
  if (entError) {
    if (!graceOnError) return <Navigate to="/subscribe" replace state={{ from: location }} />;
    console.warn('[entitlement] leitura falhou; liberando aula ao vivo (graceOnError)');
    return <>{children}</>;
  }

  if (!entitlement?.active) {
    return <Navigate to="/subscribe" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
