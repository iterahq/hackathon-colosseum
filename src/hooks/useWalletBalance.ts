/** SOL balance of a wallet on devnet, read by the browser from the public node: the number a wallet app would show. */
import { useQuery } from '@tanstack/react-query';
import { rpcCall } from '@/lib/chain/rpc';
import { queryKeys } from '@/lib/queryKeys';

export const getWalletBalance = async (address: string): Promise<number> => (await rpcCall<{ value: number }>('getBalance', [address, { commitment: 'confirmed' }])).value;

/** Lamports, or null while it is not known (no wallet, still loading, the node did not answer). */
export function useWalletBalance(wallet: string | null | undefined) {
  const query = useQuery({
    queryKey: queryKeys.walletBalance.of(wallet ?? ''),
    queryFn: () => getWalletBalance(wallet as string),
    enabled: Boolean(wallet),
    staleTime: 10_000,
    refetchInterval: 20_000,
    retry: 1,
  });
  return { lamports: query.data ?? null, pending: Boolean(wallet) && query.isPending, failed: query.isError, refetch: query.refetch };
}
