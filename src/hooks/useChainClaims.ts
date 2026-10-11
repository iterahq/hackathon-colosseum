import { useQuery } from '@tanstack/react-query';
import { readChainAssets, type ChainTarget } from '@/lib/chainClaims';
import { queryKeys } from '@/lib/queryKeys';

/** One browser-side chain read per distinct asset, independent of the server's own reading. */
export function useChainClaims(wallet: string, targets: ChainTarget[]) {
  const key = targets.map((t) => `${t.asset}:${[...t.attributes].sort().join(',')}`).sort();
  return useQuery({
    queryKey: queryKeys.achievements.chain(wallet, key),
    queryFn: ({ signal }) => readChainAssets(wallet, targets, signal),
    enabled: Boolean(wallet) && targets.length > 0,
    retry: 1,
    retryDelay: 800,
    staleTime: 60_000,
  });
}
