/**
 * React Query hook for the current user's Itera membership/role.
 * componente → hook (useQuery) → service → fetch.
 */
import { useQuery } from '@tanstack/react-query';
import { getMyMemberships } from '@/services/membership.service';
import { useAuth } from '@/auth/AuthContext';

export function useMembership() {
  const { session, configured } = useAuth();
  return useQuery({
    queryKey: ['membership', session?.user?.id ?? 'anon'],
    queryFn: getMyMemberships,
    enabled: configured && Boolean(session),
    staleTime: 60_000,
  });
}
