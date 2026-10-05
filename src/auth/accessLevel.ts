/**
 * Pure access decision extracted from RequireSubscription — the single source
 * of truth for "does this signed-in user have paid access?". Shared by the
 * subscription gate (`RequireSubscription`) and the header role pill (via
 * `useAccessLevel`) so the two can never disagree about who is a paying
 * member and who is a browsing visitor.
 *
 * ⚠️ Mirrors the rule from RequireSubscription's header comment: every
 * exemption lives in the `itera.my_subscription` view's WHERE clause (a paid
 * subscription, a tenant `status='exempt'`, or `status='grandfathered'`) and
 * arrives as `entitlement.active`. The ONLY client-side exemption is a tenant
 * admin/owner (`isTenantAdmin`), because that role is not seat-driven — it
 * manages a tenant, not a paid seat. Do not add a branch here that reads
 * client-controlled data (localStorage, JWT claims): see
 * `db/migrations/0075` and RequireSubscription's comment for why.
 */
import { isTenantAdmin, type Membership } from '@/services/membership.service';

/** The subset of `itera.my_subscription` this decision actually needs. */
export interface MinimalEntitlement {
  active?: boolean | null;
}

export interface AccessInput {
  memberships: Membership[] | null | undefined;
  entitlement: MinimalEntitlement | null | undefined;
  /** The last entitlement read FAILED. TanStack keeps the previous `data` on a
   *  failed refetch, so a stale `active: true` must not outvote the error. */
  entitlementError?: boolean;
}

/**
 * A read that FAILED after an earlier read had answered "entitled": TanStack keeps that answer in
 * `data`. Inside the native shell this keeps the learner on the page instead of downgrading a
 * subscriber on a background refetch that died in a tunnel (plan 20261003-itera-player-mobile, row
 * W-7). The browser never asks this: there a failed read paywalls, as `hasPaidAccess` says.
 */
export function wasEntitledBeforeFailedRead({ entitlement, entitlementError = false }: Pick<AccessInput, 'entitlement' | 'entitlementError'>): boolean {
  return entitlementError && entitlement?.active === true;
}

/** True when the signed-in user has full (paid or exempt) access. */
export function hasPaidAccess({ memberships, entitlement, entitlementError = false }: AccessInput): boolean {
  if (isTenantAdmin(memberships ?? [])) return true;
  return !entitlementError && entitlement?.active === true;
}
