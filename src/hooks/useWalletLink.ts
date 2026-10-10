/** Which Solana wallet the signed-in learner has: the sign-in identity, else the one linked to an e-mail account. */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { getLinkStatus } from '@/services/linkWallet.service';
import { walletOf } from '@/utils/wallet';

export function useWalletLink() {
  const { session, configured } = useAuth();
  const userId = session?.user?.id ?? 'anon';
  const identity = walletOf(session?.user);
  const query = useQuery({
    queryKey: queryKeys.walletLink.mine(userId),
    queryFn: getLinkStatus,
    enabled: configured && Boolean(session) && !identity,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const linked = query.data?.wallet ?? null;
  return { wallet: identity ?? linked, linked: !identity && Boolean(linked), pending: !identity && query.isPending && query.fetchStatus !== 'idle', userId };
}
