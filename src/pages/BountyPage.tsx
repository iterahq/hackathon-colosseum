import { PrizeTeraTag } from '@/components/bounty/PrizeTera';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BountyActionPanel } from '@/components/bounty/ActionPanel';
import { BountyShell, ClampText, ExplorerAnchor, LINK, LoadError, Notice, Reward, SECTION_TITLE, Skeleton, StatusChip } from '@/components/bounty/bountyUi';
import { DirectChip, DirectNotice } from '@/components/bounty/DirectParts';
import { EscrowPanel } from '@/components/bounty/EscrowPanel';
import { HeldNotice } from '@/components/bounty/HeldNotice';
import { JudgeCaption, JudgeChecksSection, JudgeChip, JudgePaidBlock } from '@/components/bounty/JudgeParts';
import { Ledger } from '@/components/bounty/Ledger';
import { PaidBlock } from '@/components/bounty/PaidBlock';
import { ReportBounty } from '@/components/bounty/ReportBounty';
import { SkillQuestCard } from '@/components/bounty/SkillQuestCard';
import { CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { TeraNote, TERA_BUTTON } from '@/components/tera/TeraNote';
import { useBounty, useBountyRecord } from '@/hooks/useBounties';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { addressUrl } from '@/lib/explorer';
import { formatWhen, safeHttpsUrl } from '@/utils/bounty';
import type { BountyDetail } from '@/types/bounty';

function Block({ title, children }: { title: string; children: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={SECTION_TITLE}>{title}</h2>
      <ClampText>{children}</ClampText>
    </section>
  );
}

export function PostedBy({ bounty }: { bounty: BountyDetail }) {
  const { t } = useI18n();
  const [more, setMore] = useState(false);
  const { postedBy } = bounty;
  if (postedBy.kind !== 'wallet' || !postedBy.wallet) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1" data-testid="bounty-posted-by">
        <span className={`${MONO_LABEL} text-[#A0978A]`}>
          {postedBy.kind === 'team'
            ? t('bounty.card.postedTeam', { name: postedBy.name })
            : t(postedBy.teamTest ? 'bounty.card.postedTeamWallet' : 'bounty.card.postedWallet', { name: postedBy.name, wallet: postedBy.walletShort ?? '' })}
        </span>
      </div>
    );
  }
  const explorer = safeHttpsUrl(addressUrl(postedBy.wallet));
  return (
    <div className="flex min-w-0 max-w-full flex-col" data-testid="bounty-posted-by" data-team-test={postedBy.teamTest}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={`shrink-0 rounded-full border px-2 py-1 [font:600_10px/1_JetBrains_Mono] uppercase tracking-[.08em] ${postedBy.teamTest ? 'border-[#F2C66D]/60 text-[#F2C66D]' : 'border-[#2E2A25] text-[#A0978A]'}`}
          title={t(postedBy.teamTest ? 'bounty.card.postedTeamWallet' : 'bounty.card.postedWallet', { name: postedBy.name, wallet: postedBy.walletShort ?? '' })}
          data-testid="bounty-posted-tag"
        >
          {t(postedBy.teamTest ? 'bounty.posted.tag.team' : 'bounty.posted.tag.outside')}
        </span>
        <span className="min-w-0 truncate [font:700_13px_Inter] text-[#F4EDE2]" title={postedBy.name}>{postedBy.name}</span>
        <Link to={`/u/${postedBy.wallet}`} className={`${LINK} shrink-0`} title={t('bounty.mine.profile')} data-testid="bounty-posted-profile">
          {postedBy.walletShort ?? postedBy.wallet}
        </Link>
        {explorer && (
          <a href={explorer} target="_blank" rel="noopener noreferrer" aria-label={t('bounty.explorer')} title={t('bounty.explorer')} className={`${LINK} w-7 shrink-0 justify-center`} data-testid="bounty-posted-explorer">
            ↗
          </a>
        )}
        <button type="button" aria-expanded={more} aria-controls="bounty-posted-more" onClick={() => setMore((current) => !current)} className={`${LINK} shrink-0 !text-[#A0978A]`} data-testid="bounty-posted-more-toggle">
          {t(more ? 'bounty.posted.less' : 'bounty.posted.more')}
        </button>
      </div>
      <div id="bounty-posted-more" hidden={!more} className="flex-wrap items-center gap-x-3 gap-y-0 pb-1 [&:not([hidden])]:flex" data-testid="bounty-posted-more">
        <Link to={`/u/${postedBy.wallet}`} className={LINK}>{t('bounty.mine.profile')} →</Link>
        <ExplorerAnchor href={addressUrl(postedBy.wallet)} compact />
        {bounty.writtenIn && <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]" data-testid="bounty-written-in">{t(`bounty.detail.writtenIn.${bounty.writtenIn}`)}</span>}
      </div>
    </div>
  );
}

/** /bounties/:slug: one bounty, its escrow and its on-chain ledger, public. */
export default function BountyPage() {
  const { slug = '' } = useParams();
  const { t, locale } = useI18n();
  const query = useBounty(slug);
  const record = useBountyRecord(slug, query.isPending);
  // Itera's own record paints first; what depends on the escrow account (status, accept, held) waits for the read of the chain.
  const bounty = query.data ?? (query.isPending ? record.data : null) ?? null;
  const confirming = Boolean(bounty) && !query.data;
  const missing = query.data === null || (query.isPending && record.data === null);
  usePageTitle(bounty?.title ?? t('bounty.pageTitle'));

  return (
    <BountyShell width={720}>
      <Link to="/bounties" className={LINK}>
        ← {t('bounty.detail.back')}
      </Link>
      {query.isPending && !bounty && !missing && (
        <div className="flex flex-col gap-4" aria-busy="true" data-testid="bounty-loading">
          <p role="status" className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('bounty.detail.reading')}</p>
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      )}
      {query.isError && <LoadError onRetry={() => void query.refetch()} testId="bounty-failed" />}
      {missing && (
        <div className={`${CARD} p-5`} data-testid="bounty-not-found">
          <TeraNote
            mood="oops"
            title={t('bounty.notFound.title')}
            body={t('bounty.notFound.body')}
            className="!pt-2"
            action={<Link to="/bounties" className={TERA_BUTTON}>{t('bounty.detail.back')}</Link>}
          />
        </div>
      )}
      {bounty && (
        <>
          <section className="flex flex-col gap-4" data-testid="bounty-detail" data-chain={confirming ? 'reading' : 'read'}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <PostedBy bounty={bounty} />
              <span className="flex flex-wrap items-center gap-1.5">
                {bounty.direct && <DirectChip />}
                {bounty.judge && <JudgeChip />}
                {!confirming && <StatusChip status={bounty.status} />}
              </span>
            </div>
            {bounty.judge && <JudgeCaption />}
            <h1 className="[font:700_44px/1.02_'Barlow_Condensed'] max-sm:text-[34px] [overflow-wrap:anywhere]">{bounty.title}</h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Reward sol={bounty.rewardSol} size="xl" />
              <PrizeTeraTag bounty={bounty} size="lg" />
            </div>
            {bounty.expiresAt && <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('bounty.detail.expires', { date: formatWhen(bounty.expiresAt, locale) })}</span>}
          </section>
          {bounty.direct && bounty.inviteeWallet && <DirectNotice wallet={bounty.inviteeWallet} short={bounty.inviteeWalletShort ?? bounty.inviteeWallet} />}
          {bounty.hidden && <Notice tone="error" testId="bounty-hidden-banner">{t('bounty.hidden.banner')}</Notice>}
          {bounty.rehearsal && <Notice testId="bounty-rehearsal-banner">{t('bounty.rehearsal.banner')}</Notice>}
          <PaidBlock bounty={bounty} />
          <JudgePaidBlock bounty={bounty} />
          <SkillQuestCard bounty={bounty} />
          {confirming ? (
            <p role="status" aria-busy="true" className="[font:500_13px/1.5_JetBrains_Mono] text-[#A0978A]" data-testid="bounty-chain-reading">{t('bounty.detail.confirming')}</p>
          ) : (
            <>
              <HeldNotice bounty={bounty} />
              <BountyActionPanel bounty={bounty} />
            </>
          )}
          <Block title={t('bounty.detail.brief')}>{bounty.brief}</Block>
          <Block title={t('bounty.detail.deliverable')}>{bounty.deliverable}</Block>
          <JudgeChecksSection bounty={bounty} />
          <EscrowPanel bounty={bounty} />
          <Ledger events={bounty.events} judge={bounty.judge} report={bounty.claim?.checkReport ?? null} />
          <ReportBounty bounty={bounty} />
        </>
      )}
    </BountyShell>
  );
}
