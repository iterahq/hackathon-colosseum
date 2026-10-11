import { Link } from 'react-router-dom';
import { BountyShell, LINK, LoadError, Notice, SECTION_TITLE, Skeleton } from '@/components/bounty/bountyUi';
import { PostForm } from '@/components/bounty/PostForm';
import { BTN_PRIMARY, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { useBountyPostOptions, useBountySession, useMyPostedBounties } from '@/hooks/useBounties';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { loginHref } from '@/lib/loginReturn';
import { bountyErrorCode } from '@/services/bounty.service';
import { lamportsToSol, plural } from '@/utils/bounty';
import type { PostLimits } from '@/types/bounty';

const STEPS = ['bounty.post.step1', 'bounty.post.step2', 'bounty.post.step3'] as const;

function Limits({ limits }: { limits: PostLimits }) {
  const { t } = useI18n();
  const fee = lamportsToSol(limits.feeLamports);
  return (
    <ul className="flex flex-col gap-1 [font:400_13px/1.5_Inter] text-[#A0978A]" data-testid="bounty-post-limits">
      <li>{t('bounty.post.limitsReward', { min: lamportsToSol(limits.minRewardLamports), max: lamportsToSol(limits.maxRewardLamports) })}</li>
      <li>
        {limits.escrowRentLamports === null
          ? t('bounty.post.limitsFee', { fee })
          : t('bounty.post.limitsCost', { rent: lamportsToSol(limits.escrowRentLamports), fee })}
      </li>
      {limits.postsPerDay > 0 && <li>{plural(t, 'bounty.post.limitsPerDay', limits.postsPerDay)}</li>}
      {limits.liveBounties > 0 && <li>{t('bounty.post.limitsLive', { n: limits.liveBounties })}</li>}
    </ul>
  );
}

function Composer() {
  const { t } = useI18n();
  const options = useBountyPostOptions();
  const mine = useMyPostedBounties();
  const noWallet = mine.isError && bountyErrorCode(mine.error) === 'no_wallet';
  if (options.isPending || mine.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (noWallet) {
    return (
      <div className={`${CARD} flex flex-col items-start gap-3 p-5`} data-testid="bounty-post-nowallet">
        <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.post.noWallet')}</p>
        <LinkWalletButton className={`${BTN_PRIMARY} w-full sm:w-auto`} testId="bounty-post-link-wallet" />
      </div>
    );
  }
  if (mine.isError) return <LoadError onRetry={() => void mine.refetch()} testId="bounty-post-failed" />;
  if (options.isError) return <LoadError onRetry={() => void options.refetch()} testId="bounty-post-failed" />;
  return <PostForm options={options.data} balanceLamports={mine.data.balanceLamports} />;
}

/** /bounties/post: anyone with a wallet posts a paid task and locks the reward in escrow. */
export default function BountyPostPage() {
  const { t } = useI18n();
  usePageTitle(t('bounty.post.pageTitle'));
  const { signedIn } = useBountySession();
  const options = useBountyPostOptions();

  return (
    <BountyShell>
      <Link to="/bounties" className={LINK}>
        ← {t('bounty.detail.back')}
      </Link>
      <section className="flex flex-col gap-4 pt-2" aria-labelledby="bounty-post-hero">
        <span className={`${MONO_LABEL} text-[#3FD17F]`}>{t('bounty.post.eyebrow')}</span>
        <h1 id="bounty-post-hero" className="max-w-[760px] [font:700_60px/.98_'Barlow_Condensed'] max-sm:text-[44px]">{t('bounty.post.title')}</h1>
        <p className="max-w-[640px] [font:400_16px/1.55_Inter] text-[#C9BFB0]">{t('bounty.post.sub')}</p>
      </section>
      <section className={`${CARD} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="bounty-post-how" data-testid="bounty-post-how">
        <h2 id="bounty-post-how" className={SECTION_TITLE}>{t('bounty.post.how')}</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((key, index) => (
            <li key={key} className="flex items-start gap-3 [font:500_14px/1.45_Inter] text-[#C9BFB0]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#3FD17F] [font:700_13px_JetBrains_Mono] text-[#3FD17F]">{index + 1}</span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ol>
        <Notice testId="bounty-post-trust">{t('bounty.post.trust')}</Notice>
        {options.data && <Limits limits={options.data.limits} />}
      </section>
      {signedIn ? (
        <Composer />
      ) : (
        <div className={`${CARD} flex flex-col items-start gap-3 p-5`} data-testid="bounty-post-signin">
          <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.post.signInHint')}</p>
          <Link to={loginHref('/bounties/post')} className={`${BTN_PRIMARY} w-full sm:w-auto`}>{t('bounty.post.signIn')}</Link>
        </div>
      )}
    </BountyShell>
  );
}
