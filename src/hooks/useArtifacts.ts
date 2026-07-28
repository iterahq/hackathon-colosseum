/**
 * Query hooks for learner-produced work.
 *
 * Plan: 20260728-itera-artifact-storage (Phase 2 — "Meu repositório", Phase 3 —
 * the tenant-owner view). Follows the repo's mandated chain
 * `component → useQuery hook → service`, so no component ever touches Supabase.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import {
  listMyArtifacts,
  listTenantArtifacts,
  readArtifactContent,
} from '@/services/artifact.service';

/** Everything the signed-in learner has produced (latest version per activity). */
export function useMyArtifacts() {
  return useQuery({
    queryKey: queryKeys.artifacts.mine,
    queryFn: listMyArtifacts,
  });
}

/**
 * Every artifact produced under a tenant — the owner's view (ADR-9).
 * `enabled` on the tenant id, matching the `useAdmin*` house pattern.
 */
export function useTenantArtifacts(tenantId: string | null) {
  return useQuery({
    queryKey: queryKeys.artifacts.tenant(tenantId ?? ''),
    queryFn: () => listTenantArtifacts(tenantId as string),
    enabled: Boolean(tenantId),
  });
}

/**
 * The text body of one artifact, for inline preview.
 *
 * Fetched lazily (`enabled` on an actual selection) because the bucket is
 * private: every read is a real authenticated download, so preloading a list's
 * worth of bodies would be both slow and pointless — the learner opens one.
 */
export function useArtifactContent(storagePath: string | null) {
  return useQuery({
    queryKey: queryKeys.artifacts.content(storagePath ?? ''),
    queryFn: () => readArtifactContent(storagePath as string),
    enabled: Boolean(storagePath),
    staleTime: 5 * 60_000, // content-addressed: a given path is immutable
  });
}
