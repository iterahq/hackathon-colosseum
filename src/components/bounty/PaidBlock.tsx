import { Link } from 'react-router-dom';
import { ExplorerAnchor, LINK } from '@/components/bounty/bountyUi';
import { useI18n } from '@/i18n';
import { safeHttpsUrl } from '@/utils/bounty';
import type { BountyDetail } from '@/types/bounty';

export function PaidBlock({ bounty }: { bounty: BountyDetail }) {
  const { t } = useI18n();
  const { claim, payout } = bounty;
  if (bounty.status !== 'paid' || !payout) return null;
  const delivery = safeHttpsUrl(claim?.submissionUrl);
  const winner = claim?.wallet ?? payout.wallet;
  return (
    <section className="flex flex-col gap-3 rounded-[14px] border-2 border-[#3FD17F] bg-[#3FD17F]/10 p-4 sm:p-5" aria-label={t('bounty.paid.label')} data-testid="bounty-paid">
      <p className="[font:700_32px/1.05_'Barlow_Condensed'] text-[#3FD17F] [overflow-wrap:anywhere]">
        {t('bounty.paid.title', { sol: payout.sol, wallet: claim?.walletShort ?? payout.wallet ?? '' })}
      </p>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.paid.plain')}</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <ExplorerAnchor href={payout.explorerUrl} label={t('bounty.paid.tx')} />
        {winner && (
          <Link to={`/u/${winner}`} className={LINK}>
            {t('bounty.paid.profile')} →
          </Link>
        )}
        {claim?.proofAsset && (
          <Link to={`/c/${claim.proofAsset}`} className={LINK}>
            {t('bounty.paid.cert')} →
          </Link>
        )}
        {delivery && (
          <a href={delivery} target="_blank" rel="noopener noreferrer" className={LINK}>
            {t(claim?.submissionMirrored ? 'bounty.paid.deliveryMirrored' : 'bounty.paid.delivery')} ↗
          </a>
        )}
      </div>
    </section>
  );
}
