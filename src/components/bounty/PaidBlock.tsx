import { Link } from 'react-router-dom';
import { ExplorerAnchor, LINK } from '@/components/bounty/bountyUi';
import { prizeState } from '@/components/bounty/PrizeTera';
import { useI18n } from '@/i18n';
import { safeHttpsUrl } from '@/utils/bounty';
import { localizeDecimal } from '@/utils/shopPrice';
import type { BountyDetail } from '@/types/bounty';

export function PaidBlock({ bounty }: { bounty: BountyDetail }) {
  const { t, locale } = useI18n();
  const { claim, payout } = bounty;
  if (bounty.status !== 'paid' || !payout) return null;
  const delivery = bounty.judge ? null : safeHttpsUrl(claim?.submissionUrl);
  const winner = claim?.wallet ?? payout.wallet;
  const prize = bounty.prizeTera ?? null;
  const prizeIs = prizeState(bounty);
  return (
    <section className="flex flex-col gap-2 rounded-[14px] border-2 border-[#3FD17F] bg-[#3FD17F]/10 p-4 sm:p-5" aria-label={t('bounty.paid.label')} data-testid="bounty-paid">
      <p className="[font:700_32px/1.05_'Barlow_Condensed'] text-[#3FD17F] max-sm:text-[26px]">
        {t('bounty.paid.title', { sol: localizeDecimal(payout.sol, locale), wallet: claim?.walletShort ?? payout.wallet ?? '' })}
      </p>
      {prize && prizeIs !== 'none' && (
        <div className="flex min-w-0 items-center gap-3 rounded-[12px] border border-dashed bg-[#141210] p-3" style={{ borderColor: prize.accent }} data-testid="bounty-paid-prize" data-state={prizeIs} role="status">
          {prize.imageUrl && <img src={prize.imageUrl} alt="" className={`h-20 w-20 shrink-0 rounded-[12px] bg-[#0A0908] object-cover ${prizeIs === 'unfunded' ? 'opacity-40 grayscale' : ''}`} />}
          <div className="flex min-w-0 flex-col gap-1">
            <span className="[font:700_22px/1.1_'Barlow_Condensed'] text-[#F4EDE2] [overflow-wrap:anywhere]">
              {t(prizeIs === 'delivered' ? 'prize.paid.delivered' : prizeIs === 'minting' ? 'prize.paid.minting' : 'prize.paid.unfunded', { brand: prize.brand, wallet: claim?.walletShort ?? '' })}
            </span>
            <span className="[font:400_13px/1.45_Inter] text-[#C9BFB0]">{t(prizeIs === 'unfunded' ? 'prize.paid.unfundedBody' : 'prize.paid.body')}</span>
            {prize.asset && (
              <Link to={`/c/${prize.asset}`} className={LINK} data-testid="bounty-paid-prize-proof">
                {t('prize.paid.open')} →
              </Link>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-0">
        <ExplorerAnchor href={payout.explorerUrl} label={t('bounty.paid.tx')} compact />
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
