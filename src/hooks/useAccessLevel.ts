/**
 * The signed-in user's ACCESS LEVEL — the single hook both `RequireSubscription`
 * (the gate) and `AppHeader` (the role pill) read, so the two surfaces can never
 * disagree about whether someone is a paying member or a browsing visitor.
 *
 * componente → hook (composes useAuth/useEntitlement/useMembership) → service.
 * Decision itself lives in `hasPaidAccess` (src/auth/accessLevel.ts) — this
 * hook only adds the loading/unauthenticated states around it.
 */
import { useAuth } from '@/auth/AuthContext';
import { hasPaidAccess } from '@/auth/accessLevel';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useMembership } from '@/hooks/useMembership';

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

  // Unconfigured/mock mode: mirrors RequireSubscription's pass-through — treat
  // as a full member so the mock/dev path renders unlocked.
  if (!configured) return { level: 'member', entitlementError: false };

  if (authLoading || (session && (entPending || memPending))) {
    return { level: 'pending', entitlementError: false };
  }

  if (!session) return { level: 'visitor', entitlementError: false };

  if (hasPaidAccess({ memberships, entitlement, entitlementError: entError })) {
    return { level: 'member', entitlementError: entError };
  }

  return { level: 'visitor', entitlementError: entError };
}
