/**
 * React Query hooks for the live-class feature (plan
 * 20260702-iterahq-live-class-dogfood-sync-layer).
 *
 * componente → hook (useQuery) → service → fetch.
 *
 * - useLiveClassEnabled(): the per-tenant enable gate (badge / professor surface
 *   are inert unless true).
 * - useActiveLiveClass(): the active LIVE session visible to the user → drives the
 *   home badge. Null when none / disabled. A lightweight Realtime subscription to
 *   itera.class_sessions invalidates the query so the badge appears/disappears
 *   near-instantly when a professor starts/ends a class.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import {
  getActiveLiveClass,
  getClassActivityCompleters,
  getEnabledTenantIds,
  getMySessions,
  isLiveClassEnabledForUser,
} from '@/services/liveClass.service';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/auth/AuthContext';

export function useLiveClassEnabled() {
  const { session, configured } = useAuth();
  return useQuery({
    queryKey: queryKeys.liveClass.enabled(session?.user?.id ?? 'anon'),
    queryFn: isLiveClassEnabledForUser,
    enabled: configured && Boolean(session),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The user's live-class-enabled tenant ids — feeds the deterministic
 * instructor-tenant resolver so a real instructor targets the enabled teaching
 * tenant (dfl-batch), not their PLG personal `owner` tenant. (loop-1 fix #4.)
 */
export function useEnabledTenantIds() {
  const { session, configured } = useAuth();
  return useQuery({
    queryKey: queryKeys.liveClass.enabledTenantIds(session?.user?.id ?? 'anon'),
    queryFn: getEnabledTenantIds,
    enabled: configured && Boolean(session),
    staleTime: 5 * 60 * 1000,
  });
}

export function useActiveLiveClass() {
  const { session, configured } = useAuth();
  const enabled = configured && Boolean(session);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.liveClass.active,
    queryFn: getActiveLiveClass,
    enabled,
    // Poll as a safety net in case the realtime subscription misses an event.
    refetchInterval: enabled ? 30_000 : false,
    refetchOnWindowFocus: true,
  });

  // Realtime: any INSERT/UPDATE on class_sessions may change what's active → refetch.
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return;
    const sb = getSupabase();
    const channel = sb
      .channel('live-class-watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'itera', table: 'class_sessions' },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.liveClass.active });
        }
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [enabled, queryClient]);

  return query;
}

/** The instructor's own sessions in a tenant (professor surface). */
export function useMySessions(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.liveClass.mySessions(tenantId ?? ''),
    queryFn: () => getMySessions(tenantId as string),
    enabled: Boolean(tenantId),
  });
}

/**
 * Who's done on the current activity (instructor "who's done" view). Polls.
 *
 * PRESENCE-SCOPED (loop-1 fix #2): pass the live presence roster's user ids so
 * the denominator + names are restricted to who's actually in the room — the
 * whole tenant cohort is NOT counted and absent learners are NOT leaked. The
 * present ids are folded into the query key so a roster change re-scopes.
 */
export function useClassCompleters(
  tenantId: string | null | undefined,
  activityId: string | null | undefined,
  presentUserIds?: string[]
) {
  const present = (presentUserIds ?? []).filter(Boolean).slice().sort();
  return useQuery({
    queryKey: queryKeys.liveClass.completers(activityId ?? '', present.join(',')),
    queryFn: () =>
      getClassActivityCompleters(
        tenantId as string,
        activityId as string,
        present.length > 0 ? present : undefined
      ),
    enabled: Boolean(tenantId && activityId),
    refetchInterval: 8_000,
  });
}
