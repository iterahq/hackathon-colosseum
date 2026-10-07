/**
 * The signed-in user's ACCESS LEVEL — read by `AppHeader` (the role pill) and the
 * locked/unlocked pages. `RequireSubscription` (the gate) does not call this hook:
 * both ask the same pure `accessVerdict` (src/auth/accessLevel.ts) and each maps
 * the verdict to its own answer, so they cannot disagree about who is a paying
 * member and who is a browsing visitor.
 *
 * componente → hook (composes useAuth/useEntitlement/useMembership) → service.
 */
import { useAuth } from '@/auth/AuthContext';
import { accessVerdict } from '@/auth/accessLevel';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useMembership } from '@/hooks/useMembership';
import { useShellSurface } from '@/hooks/useShellSurface';

export type AccessLevel = 'pending' | 'member' | 'visitor';

export interface AccessLevelState {
  level: AccessLevel;
  /**
   * True when the entitlement read FAILED (distinct from "resolved: no
   * access"). Callers that need graceful degradation on a flaky connection
   * (e.g. the live-class gate's `graceOnError`) still handle that themselves —
   * this flag just exposes the raw signal.
   */
  entitlementError: boolean;
}

export function useAccessLevel(): AccessLevelState {
  const { session, loading: authLoading, configured } = useAuth();
  const { data: entitlement, isPending: entPending, isError: entError } = useEntitlement();
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
    surface,
  });

  switch (verdict.kind) {
    // Unconfigured/mock mode is a full member so the mock/dev path renders unlocked.
    case 'unconfigured':
      return { level: 'member', entitlementError: false };
    case 'pending':
      return { level: 'pending', entitlementError: false };
    case 'signed-out':
    case 'no-access':
      return { level: 'visitor', entitlementError: false };
    case 'paid':
      return { level: 'member', entitlementError: entError };
    // Inside the shell the gate keeps a subscriber on the page when a refetch fails; the page must
    // then agree with the gate and not render its locked variant.
    case 'kept-after-failed-read':
      return { level: 'member', entitlementError: true };
    case 'read-failed':
      return { level: 'visitor', entitlementError: true };
  }
}
