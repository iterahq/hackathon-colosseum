/** Live-class podium medals. componente → hook → service → edge function. */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { getClassPodiumChain, recordClassPodium } from '@/services/classPodium.service';

/** The instructor's "record the podium on Solana": mints up to three medals, once per session. */
export function useRecordPodium(sessionId: string | undefined) {
  const { locale } = useI18n();
  return useMutation({ mutationFn: () => recordClassPodium(sessionId ?? '', locale) });
}

/** Which places of an ended class are on chain. Polled while the podium is on screen: the instructor records after the class. */
export function usePodiumChain(sessionId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.classPodium.chain(sessionId ?? ''),
    queryFn: () => getClassPodiumChain(sessionId ?? ''),
    enabled: enabled && Boolean(sessionId),
    retry: false,
    refetchInterval: (q) => ((q.state.data ?? []).some((place) => place.minted) || q.state.status === 'error' ? false : 10_000),
  });
}
