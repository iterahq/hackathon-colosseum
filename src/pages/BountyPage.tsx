import { PrizeTeraTag } from '@/components/bounty/PrizeTera';
import { Link, useParams } from 'react-router-dom';
import { BountyActionPanel } from '@/components/bounty/ActionPanel';
import { BountyShell, ExplorerAnchor, LINK, LoadError, Notice, RequirementChip, Reward, SECTION_TITLE, Skeleton, StatusChip } from '@/components/bounty/bountyUi';
import { DirectChip, DirectNotice } from '@/components/bounty/DirectParts';
import { EscrowPanel } from '@/components/bounty/EscrowPanel';
import { HeldNotice } from '@/components/bounty/HeldNotice';
import { JudgeCaption, JudgeChecksSection, JudgeChip, JudgePaidBlock } from '@/components/bounty/JudgeParts';
import { Ledger } from '@/components/bounty/Ledger';
import { PaidBlock } from '@/components/bounty/PaidBlock';
import { ReportBounty } from '@/components/bounty/ReportBounty';
import { CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { TeraNote, TERA_BUTTON } from '@/components/tera/TeraNote';
import { useBounty, useBountyRecord } from '@/hooks/useBounties';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { addressUrl } from '@/lib/explorer';
import { formatWhen, plural } from '@/utils/bounty';
import type { BountyDetail } from '@/types/bounty';

function Block({ title, children }: { title: string; children: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={SECTION_TITLE}>{title}</h2>
      <p className="whitespace-pre-line [font:400_15px/1.6_Inter] text-[#C9BFB0] [overflow-wrap:anywhere]">{children}</p>
    </section>
  );
}

function PostedBy({ bounty }: { bounty: BountyDetail }) {
  const { t } = useI18n();
  const { postedBy } = bounty;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="bounty-posted-by">
      <span className={`${MONO_LABEL} text-[#A0978A]`}>
        {postedBy.kind === 'team'
          ? t('bounty.card.postedTeam', { name: postedBy.name })
          : t(postedBy.teamTest ? 'bounty.card.postedTeamWallet' : 'bounty.card.postedWallet', { name: postedBy.name, wallet: postedBy.walletShort ?? '' })}
      </span>
      {postedBy.kind === 'wallet' && postedBy.wallet && (
        <>
          <Link to={`/u/${postedBy.wallet}`} className={LINK}>{t('bounty.mine.profile')} →</Link>
          <ExplorerAnchor href={addressUrl(postedBy.wallet)} />
        </>
      )}
      {postedBy.kind === 'wallet' && bounty.writtenIn && (
        <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]" data-testid="bounty-written-in">{t(`bounty.detail.writtenIn.${bounty.writtenIn}`)}</span>
      )}
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <RequirementChip trail={bounty.requirement.trail} minDays={bounty.requirement.minDays} />
              {bounty.expiresAt && <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('bounty.detail.expires', { date: formatWhen(bounty.expiresAt, locale) })}</span>}
            </div>
          </section>
          {bounty.direct && bounty.inviteeWallet && <DirectNotice wallet={bounty.inviteeWallet} short={bounty.inviteeWalletShort ?? bounty.inviteeWallet} />}
          {bounty.hidden && <Notice tone="error" testId="bounty-hidden-banner">{t('bounty.hidden.banner')}</Notice>}
          {bounty.rehearsal && <Notice testId="bounty-rehearsal-banner">{t('bounty.rehearsal.banner')}</Notice>}
          <PaidBlock bounty={bounty} />
          <JudgePaidBlock bounty={bounty} />
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
          <Block title={t('bounty.detail.requirement')}>
            {plural(t, bounty.direct ? 'bounty.detail.requirementDirectBody' : 'bounty.detail.requirementBody', bounty.requirement.totalDays, { trail: bounty.requirement.trail, min: bounty.requirement.minDays })}
          </Block>
          <EscrowPanel bounty={bounty} />
          <Ledger events={bounty.events} judge={bounty.judge} report={bounty.claim?.checkReport ?? null} />
          <ReportBounty bounty={bounty} />
        </>
      )}
    </BountyShell>
  );
}
