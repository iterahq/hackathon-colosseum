/**
 * React Query hook for the current user's Itera subscription entitlement (PLG
 * gating). componente → hook (useQuery) → service → fetch.
 *
 * Plan: 20260624-itera-plg-subscribe-flow (Phase 3).
 */
import { useQuery } from '@tanstack/react-query';
import { getMyEntitlement } from '@/services/entitlement.service';
import { useAuth } from '@/auth/AuthContext';
import { queryKeys } from '@/lib/queryKeys';

export function useEntitlement() {
  const { session, configured } = useAuth();
  return useQuery({
    queryKey: queryKeys.entitlement.mine(session?.user?.id ?? 'anon'),
    queryFn: getMyEntitlement,
    enabled: configured && Boolean(session),
    staleTime: 30_000,
  });
}
