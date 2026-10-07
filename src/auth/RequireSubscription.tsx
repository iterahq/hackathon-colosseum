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
 * INSIDE THE NATIVE SHELL (plan 20261003-itera-player-mobile, row W-7, Q-11 = A)
 * a "no access" verdict is neither a redirect nor a locked preview: both modes
 * render `ShellNoAccessScreen`, so the app never names a subscription. That
 * sentence is only for a read that ANSWERED "no access". A read that FAILED
 * keeps the page when an earlier read had answered "entitled", and otherwise
 * shows `ShellAccessUnverifiedScreen` (retry + sign out). The browser verdict
 * (`hasPaidAccess`, `graceOnError`) is untouched. A read that cannot reach the server
 * at all (offline, or the first attempt died on the network) shows the same screen at
 * once instead of waiting out React Query's retries behind a bare "Loading…"; the
 * retries go on underneath and the page appears if one of them answers.
 * ⚠️ "Keep the page after an entitled answer" is the bypass this file refuses
 * for the browser, accepted in the shell ONLY so a background refetch that dies
 * in a tunnel does not throw a subscriber out of a lesson. It rests on the
 * in-memory query cache alone (an `active: true` answer earlier in this same
 * page; nothing is persisted), the surface is client-side, and content stays
 * behind RLS either way. Do not widen it: no persisted answer, no other
 * surface, no other signal than that cached read.
 *
 * Plan: 20260624-itera-plg-subscribe-flow (Phase 3) + 20260918-visitor-mode.
 */
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { accessVerdict } from './accessLevel';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useMembership } from '@/hooks/useMembership';
import { isUnreachable } from '@/lib/networkFailure';
import { useShellSurface } from '@/hooks/useShellSurface';
import { ShellAccessUnverifiedScreen } from '@/components/shell/ShellAccessUnverifiedScreen';
import { ShellNoAccessScreen } from '@/components/shell/ShellNoAccessScreen';
import { ShellSettling } from '@/components/shell/ShellSettling';

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
  const entitlementQuery = useEntitlement();
  const { data: entitlement, isPending: entPending, isError: entError, refetch: refetchEntitlement } = entitlementQuery;
  const { data: memberships, isPending: memPending } = useMembership();
  const surface = useShellSurface();

  const verdict = accessVerdict({
    configured,
    authLoading,
    hasSession: !!session,
    entitlementPending: entPending,
    membershipPending: memPending,
    memberships,
    entitlement,
    entitlementError: entError,
    entitlementUnreachable: isUnreachable(entitlementQuery),
    surface,
  });

  // The one decision lives in `accessVerdict`; this file only maps it to an element.
  switch (verdict.kind) {
    // In unconfigured/mock mode there is no entitlement data — let through so the
    // mock/dev path still renders (mirrors RequireAuth's mock pass-through).
    case 'unconfigured':
      return <>{children}</>;

    case 'pending':
      if (verdict.unreachableInShell) return <ShellAccessUnverifiedScreen onRetry={() => void refetchEntitlement()} />;
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
          Loading…
        </div>
      );

    // Unauthenticated should already be caught by RequireAuth; defensively to login.
    case 'signed-out':
      return <Navigate to="/login" replace />;

    // Tenant admins/owners are exempt from the seat paywall; a paid/exempt entitlement also passes.
    case 'paid':
      return <>{children}</>;

    case 'kept-after-failed-read':
      if (graceOnError) console.warn('[entitlement] leitura falhou; liberando aula ao vivo (graceOnError)');
      return <>{children}</>;

    // Uma leitura que FALHOU não é uma resposta — é a ausência dela. Só a aula ao
    // vivo escolhe passar nesse caso (`graceOnError`): ela roda no mesmo wifi de
    // escola em que a query morre, e derrubar o aluno no meio da aula custa uma
    // aula real. Nas outras superfícies pagas o mesmo comportamento seria bypass
    // permanente para quem bloqueia a request de propósito, então elas paywallam
    // (ou, em `mode="preview"`, renderizam a versão travada).
    case 'read-failed':
      if (graceOnError) {
        console.warn('[entitlement] leitura falhou; liberando aula ao vivo (graceOnError)');
        return <>{children}</>;
      }
      if (verdict.surface === 'pending') return <ShellSettling />;
      if (verdict.surface === 'shell') return <ShellAccessUnverifiedScreen onRetry={() => void refetchEntitlement()} />;
      if (mode === 'preview') return <>{children}</>;
      return <Navigate to="/subscribe" replace state={{ from: location }} />;

    // No access — block (redirect) or preview (render locked), per `mode`.
    case 'no-access':
      if (verdict.surface === 'pending') return <ShellSettling />;
      if (verdict.surface === 'shell') return <ShellNoAccessScreen />;
      if (mode === 'preview') return <>{children}</>;
      return <Navigate to="/subscribe" replace state={{ from: location }} />;
  }
}
