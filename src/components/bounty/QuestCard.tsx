import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { JudgeCaption, JudgeChip } from '@/components/bounty/JudgeParts';
import { RehearsalChip, Reward, StatusChip } from '@/components/bounty/bountyUi';
import { CARD, FOCUS, RARITY_EDGE } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { formatWhen } from '@/utils/bounty';
import { rewardTier } from '@/utils/bountyBoard';
import type { Bounty } from '@/types/bounty';

export function QuestCard({ bounty }: { bounty: Bounty }) {
  const { t, locale } = useI18n();
  const dim = bounty.status === 'expired' || bounty.status === 'refunded' || bounty.status === 'refunding' || bounty.status === 'awaiting_funding';
  const { trail, minDays } = bounty.requirement;
  const foreign = bounty.writtenIn && bounty.writtenIn !== locale;
  const hasChips = foreign || bounty.judge || bounty.rehearsal;
  return (
    <Link
      to={`/bounties/${bounty.slug}`}
      style={{ borderLeftColor: RARITY_EDGE[rewardTier(bounty.rewardLamports)] }}
      className={`${CARD} group flex w-full min-w-0 flex-col gap-2.5 border-l-[3px] p-4 transition-[border-color,transform] hover:border-[#3FD17F] motion-safe:hover:-translate-y-0.5 ${dim ? 'opacity-70' : ''} ${FOCUS}`}
      data-testid="bounty-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="shrink-0 whitespace-nowrap">
          <Reward sol={bounty.rewardSol} />
        </span>
        <StatusChip status={bounty.status} />
      </div>
      <h3 className="line-clamp-2 [font:700_24px/1.1_'Barlow_Condensed'] text-[#F4EDE2] [overflow-wrap:anywhere]">{bounty.title}</h3>
      <p className="line-clamp-2 [font:400_13px/1.5_Inter] text-[#A0978A]">{bounty.summary}</p>
      {hasChips && (
        <div className="flex flex-wrap items-center gap-1.5">
          {foreign && (
            <span
              className="inline-flex items-center rounded-full border border-[#2E2A25] px-2 py-0.5 [font:700_11px_JetBrains_Mono] uppercase text-[#C9BFB0]"
              title={t(bounty.writtenIn === 'en' ? 'bounty.card.langEn' : 'bounty.card.langPt')}
              aria-label={t(bounty.writtenIn === 'en' ? 'bounty.card.langEn' : 'bounty.card.langPt')}
              data-testid="bounty-card-lang"
            >
              {bounty.writtenIn}
            </span>
          )}
          {bounty.judge && <JudgeChip />}
          {bounty.rehearsal && <RehearsalChip />}
        </div>
      )}
      {bounty.judge && <JudgeCaption judge={bounty.judge} needsLine />}
      {bounty.status === 'paid' && bounty.claim && (
        <span className="[font:700_11px_JetBrains_Mono] text-[#C9BFB0]">{t(bounty.rehearsal ? 'bounty.card.paidToRehearsal' : 'bounty.card.paidTo', { wallet: bounty.claim.walletShort })}</span>
      )}
      {(bounty.status === 'claimed' || bounty.status === 'submitted') && bounty.claim && (
        <span className="[font:700_11px_JetBrains_Mono] text-[#C9BFB0]" data-testid="bounty-card-held">
          {t('bounty.card.heldBy', { wallet: bounty.claim.walletShort, time: formatWhen(bounty.claim.deadlineAt, locale) })}
        </span>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-1">
        <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full border border-[#2E2A25] bg-[#1C1916] px-2.5 py-1 [font:500_11px/1.2_JetBrains_Mono] text-[#C9BFB0]">
          <Lock aria-hidden size={11} className="shrink-0 text-[#A0978A]" />
          <span className="truncate">{t(minDays === 1 ? 'bounty.req.one' : 'bounty.req.many', { trail, n: minDays })}</span>
        </span>
        <span className="truncate [font:500_11px_JetBrains_Mono] text-[#A0978A]" data-testid="bounty-card-posted-by">
          {bounty.postedBy.kind === 'team'
            ? t('bounty.card.postedTeam', { name: bounty.postedBy.name })
            : t(bounty.postedBy.teamTest ? 'bounty.card.postedTeamWallet' : 'bounty.card.postedWallet', { name: bounty.postedBy.name, wallet: bounty.postedBy.walletShort ?? '' })}
        </span>
      </div>
    </Link>
  );
}
