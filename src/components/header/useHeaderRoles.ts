import { useAccessLevel } from '@/hooks/useAccessLevel';
import { useEnabledTenantIds } from '@/hooks/useLiveClass';
import { useMembership } from '@/hooks/useMembership';
import { highestRole, instructorTenantId, isTenantAdmin } from '@/services/membership.service';

export interface HeaderRoles {
  /** i18n key of the role pill. */
  roleKey: string;
  privileged: boolean;
  admin: boolean;
  canStartLiveClass: boolean;
}

/** What the account menu may offer: the role pill plus the staff areas the membership opens. */
export function useHeaderRoles(): HeaderRoles {
  const { data: memberships } = useMembership();
  const { data: enabledTenantIds } = useEnabledTenantIds();
  const { level } = useAccessLevel();
  const list = memberships ?? [];
  const role = highestRole(list);
  const visitor = level === 'visitor' && role === 'learner';
  const roleKey =
    role === 'owner' || role === 'tenant_admin' ? 'role.admin' : role === 'instructor' ? 'role.instructor' : role === 'author' ? 'role.author' : visitor ? 'role.visitor' : 'role.learner';
  return {
    roleKey,
    privileged: role !== 'learner' && !visitor,
    admin: isTenantAdmin(list),
    canStartLiveClass: instructorTenantId(list, { enabledTenantIds: enabledTenantIds ?? [] }) !== null,
  };
}
