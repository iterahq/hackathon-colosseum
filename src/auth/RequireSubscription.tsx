/**
 * Subscription gate (PLG) — wraps the learner surfaces so only a user with an
 * ACTIVE subscription can reach the player. Behaviour:
 *   - unauthenticated  -> RequireAuth (upstream) already redirects to /login.
 *   - signed in, NO active subscription -> redirect to /subscribe (default
 *     `mode="block"`), UNLESS `mode="preview"` — see below.
 *   - signed in WITH active subscription -> render children.
 *   - tenant-admins/owners are EXEMPT (they manage a tenant; their access is
 *     role-driven, not seat-driven) — keeps the admin surface and B2B tenant
 *     members from being paywalled.
 *   - `graceOnError` (opt-in, hoje só a aula ao vivo) deixa passar quando a
 *     leitura de entitlement FALHA; ver o comentário no check.
 *
 * `mode="preview"` — "visitor mode" (2026-09-18). A handful of surfaces
 * ("/", "/catalog", "/program/:slug") are BROWSABLE without a subscription:
 * a signed-in user with no active entitlement still renders `children`
 * instead of being redirected, so the page itself can render a LOCKED,
 * "subscribe to unlock" experience (see `useAccessLevel`). This is NOT a new
 * exemption — the entitlement decision is unchanged (`hasPaidAccess`) — it
 * only changes what happens on a "no access" verdict: render-locked instead
 * of redirect. Content stays protected regardless: `itera.activities` RLS
 * requires `itera.current_user_is_entitled()`, so a preview page that tries
 * to read real activity rows gets nothing back from the DB either way.
 * `/lesson/:lessonId` and `/artifacts` keep the default `mode="block"`.
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
 * não tem paywall. `mode="preview"` não é uma isenção — quem entra sem
 * assinatura continua SEM `hasPaidAccess`; só muda a reação da rota.
 *
 * Plan: 20260624-itera-plg-subscribe-flow (Phase 3) + 20260918-visitor-mode.
 */
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { hasPaidAccess } from './accessLevel';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useMembership } from '@/hooks/useMembership';

export function RequireSubscription({
  children,
  graceOnError = false,
  mode = 'block',
}: {
  children: ReactNode;
  graceOnError?: boolean;
  /** `"block"` (default) redirects to /subscribe; `"preview"` renders `children`
   *  locked instead — see the file header. */
  mode?: 'block' | 'preview';
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

  // Tenant admins/owners are exempt from the seat paywall; a paid/exempt
  // entitlement also passes. Single decision, shared with useAccessLevel.
  if (hasPaidAccess({ memberships, entitlement, entitlementError: entError })) return <>{children}</>;

  // Uma leitura que FALHOU não é uma resposta — é a ausência dela. Só a aula ao
  // vivo escolhe passar nesse caso (`graceOnError`): ela roda no mesmo wifi de
  // escola em que a query morre, e derrubar o aluno no meio da aula custa uma
  // aula real. Nas outras superfícies pagas o mesmo comportamento seria bypass
  // permanente para quem bloqueia a request de propósito, então elas paywallam
  // (ou, em `mode="preview"`, renderizam a versão travada).
  if (entError) {
    if (graceOnError) {
      console.warn('[entitlement] leitura falhou; liberando aula ao vivo (graceOnError)');
      return <>{children}</>;
    }
    if (mode === 'preview') return <>{children}</>;
    return <Navigate to="/subscribe" replace state={{ from: location }} />;
  }

  // No access — block (redirect) or preview (render locked), per `mode`.
  if (mode === 'preview') return <>{children}</>;
  return <Navigate to="/subscribe" replace state={{ from: location }} />;
}
