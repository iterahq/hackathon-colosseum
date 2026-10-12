import { PrizeTeraTag } from '@/components/bounty/PrizeTera';
import { Link } from 'react-router-dom';
import { Reward } from '@/components/bounty/bountyUi';
import { DirectChip } from '@/components/bounty/DirectParts';
import { CARD, FOCUS, MONO_LABEL } from '@/components/shop/shopStyles';
import { useInvitedInbox } from '@/hooks/useInvites';
import { useI18n } from '@/i18n';
import { openInvites, secondsLeft } from '@/utils/directBounty';
import { formatRemaining } from '@/utils/bounty';
import type { Bounty } from '@/types/bounty';

export function InviteRow({ bounty, now }: { bounty: Bounty; now: number }) {
  const { t } = useI18n();
  const left = secondsLeft(bounty.expiresAt, now);
  return (
    <li className="flex min-w-0">
      <Link
        to={`/bounties/${bounty.slug}`}
        className={`flex w-full min-w-0 flex-col gap-2 rounded-[12px] border border-[#2E2A25] bg-[#0A0908] p-3.5 transition-colors hover:border-[#3FD17F] sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${FOCUS}`}
        data-testid="invite-row"
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="[font:700_22px/1.1_'Barlow_Condensed'] text-[#F4EDE2] [overflow-wrap:anywhere]">{bounty.title}</span>
          <span className={`${MONO_LABEL} text-[#A0978A] [overflow-wrap:anywhere]`}>
            {t('bounty.inbox.sponsor', { name: bounty.postedBy.name })}
            {' · '}
            {left === null ? t('bounty.inbox.noDate') : t('bounty.inbox.left', { time: formatRemaining(left) })}
          </span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-3">
          <Reward sol={bounty.rewardSol} />
          <PrizeTeraTag bounty={bounty} link={false} />
          <span className="[font:700_13px_JetBrains_Mono] text-[#3FD17F]">{t('bounty.inbox.open')} →</span>
        </span>
      </Link>
    </li>
  );
}

/** Direct bounties addressed to the signed-in wallet. Renders nothing while loading, on failure and when there is nothing open. */
export function InviteInbox({ now = Date.now() }: { now?: number }) {
  const { t } = useI18n();
  const inbox = useInvitedInbox();
  const rows = inbox.data ? openInvites(inbox.data.bounties) : [];
  if (rows.length === 0) return null;
  return (
    <section className={`${CARD} flex flex-col gap-3 !border-[#F2C66D]/60 p-4 sm:p-5`} aria-labelledby="invite-inbox-title" data-testid="invite-inbox">
      <div className="flex flex-wrap items-center gap-2">
        <DirectChip />
        <h2 id="invite-inbox-title" className="[font:700_28px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{t('bounty.inbox.title')}</h2>
      </div>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.inbox.sub')}</p>
      <ul className="flex flex-col gap-2.5">
        {rows.map((bounty) => (
          <InviteRow key={bounty.id} bounty={bounty} now={now} />
        ))}
      </ul>
      {inbox.data && !inbox.data.chainRead && <p className="[font:500_12px_JetBrains_Mono] text-[#A0978A]" data-testid="invite-inbox-unchecked">{t('bounty.inbox.notChecked')}</p>}
    </section>
  );
}
