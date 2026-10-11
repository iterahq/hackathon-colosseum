import { Link } from 'react-router-dom';
import { BountyShell, LINK, LoadError, Skeleton } from '@/components/bounty/bountyUi';
import { PostedBountyCard } from '@/components/bounty/PostedBountyCard';
import { BTN_PRIMARY, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { useBountySession, useMyPostedBounties } from '@/hooks/useBounties';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { shortAddress } from '@/lib/explorer';
import { loginHref } from '@/lib/loginReturn';
import { bountyErrorCode } from '@/services/bounty.service';
import { isDraft, lamportsToSol } from '@/utils/bounty';

/** /bounties/mine: the console of the wallet that posted bounties. */
export default function BountyMinePage() {
  const { t } = useI18n();
  usePageTitle(t('bounty.mine.pageTitle'));
  const { signedIn } = useBountySession();
  const list = useMyPostedBounties();
  const noWallet = list.isError && bountyErrorCode(list.error) === 'no_wallet';
  const data = list.data;
  const sorted = data ? [...data.bounties].sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '') || 0) : [];
  const drafts = sorted.filter(isDraft);
  const items = sorted.filter((bounty) => !isDraft(bounty));

  return (
    <BountyShell>
      <Link to="/bounties" className={LINK}>
        ← {t('bounty.detail.back')}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="[font:700_44px/1.02_'Barlow_Condensed'] max-sm:text-[34px]">{t('bounty.mine.title')}</h1>
        <p className="max-w-[640px] [font:400_15px/1.55_Inter] text-[#C9BFB0]">{t('bounty.mine.sub')}</p>
      </div>
      {!signedIn && (
        <div className={`${CARD} flex flex-col items-start gap-3 p-5`} data-testid="bounty-mine-signin">
          <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.mine.signIn')}</p>
          <Link to={loginHref('/bounties/mine')} className={`${BTN_PRIMARY} w-full sm:w-auto`}>{t('bounty.post.signIn')}</Link>
        </div>
      )}
      {signedIn && list.isPending && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}
      {noWallet && (
        <div className={`${CARD} flex flex-col items-start gap-3 p-5`} data-testid="bounty-mine-nowallet">
          <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.mine.noWallet')}</p>
          <LinkWalletButton className={`${BTN_PRIMARY} w-full sm:w-auto`} testId="bounty-mine-link-wallet" />
        </div>
      )}
      {list.isError && !noWallet && <LoadError onRetry={() => void list.refetch()} testId="bounty-mine-failed" />}
      {data && (
        <>
          <p className={`${MONO_LABEL} text-[#A0978A]`} data-testid="bounty-mine-wallet">
            {t('bounty.mine.wallet')} · {shortAddress(data.wallet)}
            {data.balanceLamports !== null && ` · ${t('bounty.mine.balance', { sol: lamportsToSol(data.balanceLamports) })}`}
          </p>
          {drafts.length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="bounty-mine-drafts-title" data-testid="bounty-mine-drafts">
              <h2 id="bounty-mine-drafts-title" className={`${MONO_LABEL} text-[#F2C66D]`}>{t('bounty.mine.drafts')}</h2>
              <ul className="flex flex-col gap-3">
                {drafts.map((bounty) => (
                  <PostedBountyCard key={bounty.id} bounty={bounty} />
                ))}
              </ul>
            </section>
          )}
          {items.length === 0 && drafts.length === 0 ? (
            <div className={`${CARD} flex flex-col items-start gap-3 p-5`} data-testid="bounty-mine-empty">
              <p className="[font:500_14px_Inter] text-[#A0978A]">{t('bounty.mine.empty')}</p>
              <Link to="/bounties/post" className={`${BTN_PRIMARY} w-full sm:w-auto`}>{t('bounty.mine.post')}</Link>
            </div>
          ) : items.length > 0 && (
            <ul className="flex flex-col gap-3" data-testid="bounty-mine-list">
              {items.map((bounty) => (
                <PostedBountyCard key={bounty.id} bounty={bounty} />
              ))}
            </ul>
          )}
        </>
      )}
    </BountyShell>
  );
}
