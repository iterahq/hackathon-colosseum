import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BountyShell, LINK, LoadError, SECTION_TITLE, Skeleton } from '@/components/bounty/bountyUi';
import { CreateBountyForm } from '@/components/bounty/CreateBountyForm';
import { ModerationSection } from '@/components/bounty/ModerationSection';
import { FundingItem, PlainItem, ReviewItem } from '@/components/bounty/SponsorItems';
import { BTN_PRIMARY, CARD } from '@/components/shop/shopStyles';
import { TeraNote } from '@/components/tera/TeraNote';
import { useBountySession, useSponsorBounties } from '@/hooks/useBounties';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { loginHref } from '@/lib/loginReturn';
import { bountyErrorCode } from '@/services/bounty.service';
import type { SponsorBounty } from '@/types/bounty';

const OPEN_STATES: readonly string[] = ['open', 'claimed', 'submitted', 'paying', 'refunding', 'expired'];

function Group({ title, items, testId, render }: { title: string; items: SponsorBounty[]; testId: string; render: (b: SponsorBounty) => ReactNode }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={title} data-testid={testId}>
      <h2 className={SECTION_TITLE}>
        {title} <span className="[font:700_14px_JetBrains_Mono] text-[#A0978A]">{items.length}</span>
      </h2>
      <ul className="flex flex-col gap-3">{items.map(render)}</ul>
    </section>
  );
}

/** /bounties/manage: the sponsor console. The server decides who is staff; everyone else sees a plain notice. */
export default function BountyManagePage() {
  const { t } = useI18n();
  usePageTitle(t('bounty.manage.title'));
  const { signedIn } = useBountySession();
  const list = useSponsorBounties();
  const forbidden = list.isError && bountyErrorCode(list.error) === 'forbidden';
  const data = list.data;
  const bounties = data?.bounties ?? [];
  const review = bounties.filter((b) => b.status === 'submitted' && b.review);
  const funding = bounties.filter((b) => b.status === 'awaiting_funding');
  const open = bounties.filter((b) => OPEN_STATES.includes(b.status) && !review.includes(b));
  const closed = bounties.filter((b) => b.status === 'paid' || b.status === 'refunded');

  return (
    <BountyShell>
      <Link to="/bounties" className={LINK}>
        ← {t('bounty.detail.back')}
      </Link>
      <h1 className="[font:700_44px/1.02_'Barlow_Condensed'] max-sm:text-[34px]">{t('bounty.manage.title')}</h1>
      {!signedIn && (
        <div className={`${CARD} flex flex-col items-start gap-3 p-5`} data-testid="bounty-manage-signin">
          <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.manage.signIn')}</p>
          <Link to={loginHref('/bounties/manage')} className={BTN_PRIMARY}>{t('bounty.signIn.cta')}</Link>
        </div>
      )}
      {signedIn && list.isPending && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}
      {forbidden && (
        <div className={`${CARD} p-5`} data-testid="bounty-forbidden">
          <TeraNote mood="neutral" title={t('bounty.manage.forbiddenTitle')} body={t('bounty.manage.forbidden')} className="!pt-2" />
        </div>
      )}
      {list.isError && !forbidden && <LoadError onRetry={() => void list.refetch()} testId="bounty-manage-failed" />}
      {data && (
        <>
          {bounties.length === 0 && <p className="[font:500_14px_Inter] text-[#A0978A]" data-testid="bounty-manage-empty">{t('bounty.manage.empty')}</p>}
          <Group testId="bounty-group-review" title={t('bounty.manage.review')} items={review} render={(b) => <ReviewItem key={b.id} bounty={b} />} />
          <Group testId="bounty-group-funding" title={t('bounty.manage.funding')} items={funding} render={(b) => <FundingItem key={b.id} bounty={b} />} />
          <Group testId="bounty-group-open" title={t('bounty.manage.open')} items={open} render={(b) => <PlainItem key={b.id} bounty={b} />} />
          <Group testId="bounty-group-closed" title={t('bounty.manage.closed')} items={closed} render={(b) => <PlainItem key={b.id} bounty={b} />} />
          <CreateBountyForm trails={data.trails} />
          <ModerationSection />
        </>
      )}
    </BountyShell>
  );
}
