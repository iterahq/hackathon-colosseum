/** The direct bounties addressed to the signed-in learner's wallet. */
import { useQuery } from '@tanstack/react-query';
import { useBountySession } from '@/hooks/useBounties';
import { useWalletLink } from '@/hooks/useWalletLink';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { getInvitedInbox } from '@/services/bounty.service';
import { openInvites } from '@/utils/directBounty';

export function useInvitedInbox() {
  const { signedIn } = useBountySession();
  const { wallet } = useWalletLink();
  const { locale } = useI18n();
  return useQuery({
    queryKey: queryKeys.bounty.invited(wallet ?? '', locale),
    queryFn: () => getInvitedInbox(wallet ?? '', locale),
    enabled: signedIn && Boolean(wallet),
    staleTime: 60_000,
    retry: false,
  });
}

/** How many direct bounties are open for this wallet; 0 while unknown, so a badge never shows a guess. */
export function useOpenInviteCount(): number {
  const inbox = useInvitedInbox();
  return inbox.data ? openInvites(inbox.data.bounties).length : 0;
}
