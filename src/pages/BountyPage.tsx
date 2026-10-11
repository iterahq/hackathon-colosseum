import { Link, useParams } from 'react-router-dom';
import { BountyActionPanel } from '@/components/bounty/ActionPanel';
import { BountyShell, LINK, LoadError, RequirementChip, Reward, SECTION_TITLE, Skeleton, StatusChip } from '@/components/bounty/bountyUi';
import { EscrowPanel } from '@/components/bounty/EscrowPanel';
import { Ledger } from '@/components/bounty/Ledger';
import { PaidBlock } from '@/components/bounty/PaidBlock';
import { CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { TeraNote, TERA_BUTTON } from '@/components/tera/TeraNote';
import { useBounty } from '@/hooks/useBounties';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { formatWhen } from '@/utils/bounty';

function Block({ title, children }: { title: string; children: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={SECTION_TITLE}>{title}</h2>
      <p className="whitespace-pre-line [font:400_15px/1.6_Inter] text-[#C9BFB0] [overflow-wrap:anywhere]">{children}</p>
    </section>
  );
}

/** /bounties/:slug: one bounty, its escrow and its on-chain ledger, public. */
export default function BountyPage() {
  const { slug = '' } = useParams();
  const { t, locale } = useI18n();
  const query = useBounty(slug);
  const bounty = query.data ?? null;
  usePageTitle(bounty?.title ?? t('bounty.pageTitle'));

  return (
    <BountyShell width={720}>
      <Link to="/bounties" className={LINK}>
        ← {t('bounty.detail.back')}
      </Link>
      {query.isPending && (
        <div className="flex flex-col gap-4" aria-busy="true" data-testid="bounty-loading">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      )}
      {query.isError && <LoadError onRetry={() => void query.refetch()} testId="bounty-failed" />}
      {query.data === null && (
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
          <section className="flex flex-col gap-4" data-testid="bounty-detail">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.detail.sponsor', { name: bounty.sponsor })}</span>
              <StatusChip status={bounty.status} />
            </div>
            <h1 className="[font:700_44px/1.02_'Barlow_Condensed'] max-sm:text-[34px] [overflow-wrap:anywhere]">{bounty.title}</h1>
            <Reward sol={bounty.rewardSol} size="xl" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <RequirementChip trail={bounty.requirement.trail} minDays={bounty.requirement.minDays} />
              {bounty.expiresAt && <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('bounty.detail.expires', { date: formatWhen(bounty.expiresAt, locale) })}</span>}
            </div>
          </section>
          <PaidBlock bounty={bounty} />
          <BountyActionPanel bounty={bounty} />
          <Block title={t('bounty.detail.brief')}>{bounty.brief}</Block>
          <Block title={t('bounty.detail.deliverable')}>{bounty.deliverable}</Block>
          <Block title={t('bounty.detail.requirement')}>
            {t('bounty.detail.requirementBody', { trail: bounty.requirement.trail, n: bounty.requirement.minDays, total: bounty.requirement.totalDays })}
          </Block>
          <EscrowPanel bounty={bounty} />
          <Ledger events={bounty.events} />
        </>
      )}
    </BountyShell>
  );
}
