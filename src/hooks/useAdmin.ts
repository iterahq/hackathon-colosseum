/**
 * React Query hooks for the tenant-admin observability surface (plan #6).
 * componente → hook (useQuery) → service → fetch.
 *
 * All hooks are gated on a resolved tenantId (the admin's own tenant); they stay
 * disabled until the membership query yields it, so a learner/anon never fires them.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import {
  getAdminRoster,
  getAdminCompletion,
  getAdminEngagement,
} from '@/services/admin.service';

export function useAdminRoster(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.roster(tenantId ?? ''),
    queryFn: () => getAdminRoster(tenantId as string),
    enabled: Boolean(tenantId),
  });
}

export function useAdminCompletion(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.completion(tenantId ?? ''),
    queryFn: () => getAdminCompletion(tenantId as string),
    enabled: Boolean(tenantId),
  });
}

export function useAdminEngagement(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.engagement(tenantId ?? ''),
    queryFn: () => getAdminEngagement(tenantId as string),
    enabled: Boolean(tenantId),
  });
}
