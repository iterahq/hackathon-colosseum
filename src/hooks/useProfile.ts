/**
 * React Query hook for the current user's Itera self-profile (display_name +
 * avatar_url, mirrored from DFL on federated login).
 * componente → hook (useQuery) → service → fetch.
 */
import { useQuery } from '@tanstack/react-query';
import { getMyProfile } from '@/services/profile.service';
import { useAuth } from '@/auth/AuthContext';

export function useProfile() {
  const { session, configured } = useAuth();
  return useQuery({
    queryKey: ['profile', session?.user?.id ?? 'anon'],
    queryFn: getMyProfile,
    enabled: configured && Boolean(session),
    staleTime: 60_000,
  });
}
