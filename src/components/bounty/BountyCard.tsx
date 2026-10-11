import { Link } from 'react-router-dom';
import { RehearsalChip, Reward, RequirementChip, StatusChip } from '@/components/bounty/bountyUi';
import { CARD, FOCUS, MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { formatWhen } from '@/utils/bounty';
import type { Bounty } from '@/types/bounty';

export function BountyCard({ bounty }: { bounty: Bounty }) {
  const { t, locale } = useI18n();
  const dim = bounty.status === 'expired' || bounty.status === 'refunded' || bounty.status === 'refunding' || bounty.status === 'awaiting_funding';
  return (
    <Link
      to={`/bounties/${bounty.slug}`}
      className={`${CARD} group flex w-full flex-col gap-3 p-4 transition-colors hover:border-[#3FD17F] sm:p-5 ${dim ? 'opacity-70' : ''} ${FOCUS}`}
      data-testid="bounty-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`${MONO_LABEL} min-w-0 truncate text-[#A0978A]`} data-testid="bounty-card-posted-by">
          {bounty.postedBy.kind === 'team'
            ? t('bounty.card.postedTeam', { name: bounty.postedBy.name })
            : t('bounty.card.postedWallet', { name: bounty.postedBy.name, wallet: bounty.postedBy.walletShort ?? '' })}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {bounty.rehearsal && <RehearsalChip />}
          <StatusChip status={bounty.status} />
        </span>
      </div>
      <h3 className="[font:700_26px/1.1_'Barlow_Condensed'] text-[#F4EDE2] [overflow-wrap:anywhere]">{bounty.title}</h3>
      <p className="line-clamp-3 [font:400_14px/1.5_Inter] text-[#C9BFB0]">{bounty.summary}</p>
      <div className="mt-auto flex flex-col gap-3 pt-1">
        <Reward sol={bounty.rewardSol} />
        <div className="flex flex-wrap items-center gap-2">
          <RequirementChip trail={bounty.requirement.trail} minDays={bounty.requirement.minDays} />
          {bounty.status === 'paid' && bounty.claim && (
            <span className="[font:700_12px_JetBrains_Mono] text-[#F4EDE2]">{t(bounty.rehearsal ? 'bounty.card.paidToRehearsal' : 'bounty.card.paidTo', { wallet: bounty.claim.walletShort })}</span>
          )}
          {(bounty.status === 'claimed' || bounty.status === 'submitted') && bounty.claim && (
            <span className="[font:700_12px_JetBrains_Mono] text-[#F4EDE2]" data-testid="bounty-card-held">
              {t('bounty.card.heldBy', { wallet: bounty.claim.walletShort, time: formatWhen(bounty.claim.deadlineAt, locale) })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
