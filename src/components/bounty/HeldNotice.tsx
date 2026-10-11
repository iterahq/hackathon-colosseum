import { Link } from 'react-router-dom';
import { LINK, Notice } from '@/components/bounty/bountyUi';
import { useCountdown } from '@/hooks/useCountdown';
import { useBountySession, useMyBountyStatus } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { loginHref } from '@/lib/loginReturn';
import { formatRemaining, formatWhen } from '@/utils/bounty';
import type { BountyDetail } from '@/types/bounty';

export function HeldNotice({ bounty }: { bounty: BountyDetail }) {
  const { t, locale } = useI18n();
  const { signedIn } = useBountySession();
  const mine = useMyBountyStatus(bounty.id);
  const claim = bounty.claim;
  const deadline = claim?.deadlineAt ? Date.parse(claim.deadlineAt) : null;
  const left = useCountdown(deadline !== null && Number.isFinite(deadline) ? deadline : null);
  const held = bounty.status === 'claimed' || bounty.status === 'submitted';
  const own = mine.data?.claim?.bountyId === bounty.id && (mine.data.claim.status === 'active' || mine.data.claim.status === 'submitted');
  if (!held || !claim || own) return null;

  return (
    <Notice testId="bounty-held">
      <p>
        {bounty.status === 'submitted'
          ? t('bounty.held.submitted', { wallet: claim.walletShort })
          : left > 0
            ? t('bounty.held.claimed', { wallet: claim.walletShort, date: formatWhen(claim.deadlineAt, locale), time: formatRemaining(left) })
            : t('bounty.held.claimedLate', { wallet: claim.walletShort })}
      </p>
      <Link to="/bounties" className={`${LINK} mt-1`} data-testid="bounty-held-others">
        {t('bounty.held.others')} →
      </Link>
      {!signedIn && (
        <Link to={loginHref(`/bounties/${bounty.slug}`)} className={`${LINK} ml-4 mt-1`} data-testid="bounty-held-sign-in">
          {t('bounty.held.isYou')} →
        </Link>
      )}
    </Notice>
  );
}
