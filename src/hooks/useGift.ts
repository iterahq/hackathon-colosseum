/** Gift a life and the invite reward. componente → hook → service → edge function. A failed read just hides the feature. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { getGiftInbox, getGiftPrice, getReferralStatus, markGiftsSeen } from '@/services/gift.service';
import { isGuestAccessToken } from '@/services/guestSession.service';

function useLearner() {
  const { session, configured } = useAuth();
  const signedIn = configured && Boolean(session) && !isGuestAccessToken(session?.access_token);
  return { signedIn, userId: session?.user?.id ?? 'anon' };
}

export function useGiftPrice() {
  const { signedIn } = useLearner();
  const { locale } = useI18n();
  return useQuery({ queryKey: queryKeys.gift.price(locale), queryFn: () => getGiftPrice(locale), enabled: signedIn, retry: false, staleTime: 5 * 60_000 });
}

/** Asked once per app load: gifts the learner has not been shown yet. */
export function useGiftInbox({ enabled = true }: { enabled?: boolean } = {}) {
  const { signedIn, userId } = useLearner();
  return useQuery({ queryKey: queryKeys.gift.inbox(userId), queryFn: getGiftInbox, enabled: enabled && signedIn, retry: false, staleTime: Infinity, refetchOnWindowFocus: false });
}

export function useMarkGiftsSeen() {
  const { userId } = useLearner();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markGiftsSeen,
    onMutate: () => queryClient.setQueryData(queryKeys.gift.inbox(userId), []),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.companion.mine(userId) }),
  });
}

export function useReferralStatus({ enabled = true }: { enabled?: boolean } = {}) {
  const { signedIn, userId } = useLearner();
  return useQuery({ queryKey: queryKeys.referral.mine(userId), queryFn: getReferralStatus, enabled: enabled && signedIn, retry: false, staleTime: 60_000 });
}
