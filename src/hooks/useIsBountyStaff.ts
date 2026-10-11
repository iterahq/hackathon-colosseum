import { useBountySession } from '@/hooks/useBounties';
import { useMembership } from '@/hooks/useMembership';

const STAFF_ROLES: readonly string[] = ['instructor', 'tenant_admin', 'owner'];

/** Staff of a real tenant, the same rule the sponsor console enforces on the server. */
export function useIsBountyStaff(): boolean {
  const { signedIn } = useBountySession();
  const memberships = useMembership();
  return signedIn && (memberships.data ?? []).some((m) => STAFF_ROLES.includes(m.role) && !m.isPersonal);
}
