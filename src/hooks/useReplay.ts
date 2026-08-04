/**
 * React Query hooks for the replay surface.
 * componente → hook (useQuery) → service → fetch.
 *
 * The admin gate lives in the SERVICE (`replay.service.ts`), not here, so that
 * a future non-React consumer cannot get the data by skipping a hook.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchReplaySession, listReplaySessions } from '@/services/replay.service';
import { useAuth } from '@/auth/AuthContext';

export function useReplayIndex() {
  const { session, configured } = useAuth();
  return useQuery({
    queryKey: ['replay', 'index', session?.user?.id ?? 'anon'],
    queryFn: () => listReplaySessions(),
    enabled: configured && Boolean(session),
    staleTime: 30_000,
  });
}

export function useReplaySession(traceId: string | undefined) {
  const { session, configured } = useAuth();
  return useQuery({
    queryKey: ['replay', 'session', traceId ?? '', session?.user?.id ?? 'anon'],
    queryFn: () => fetchReplaySession(traceId ?? ''),
    enabled: configured && Boolean(session) && Boolean(traceId),
    // A settled trace is append-only and immutable. There is nothing to refetch.
    staleTime: Infinity,
  });
}
