import { Link } from 'react-router-dom';
import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { useCompanion } from '@/hooks/useCompanion';
import { useLoopView } from '@/hooks/useLoopView';
import { useI18n } from '@/i18n';
import { BountiesOpened } from './BountiesOpened';
import { LOOP_LABEL, LOOP_LINK, LOOP_PANEL } from './loopStyles';

const WALLET_BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-full bg-[#3FD17F] px-5 [font:700_14px_Inter] text-[#0A0908] hover:bg-[#5BE095]';

/** Dashboard side card: the open bounties this learner's certification opens, read from the public board. */
export function BountiesForYouCard() {
  const { t } = useI18n();
  const { wallet } = useCompanion();
  const loop = useLoopView(wallet ?? null);
  return (
    <section className={`${LOOP_PANEL} flex flex-col gap-3`} aria-labelledby="loop-dash-title" data-testid="dash-bounties" data-state={loop.status}>
      <div className="flex flex-col gap-1">
        <span className={`${LOOP_LABEL} !text-[#3FD17F]`}>{t('loop.dash.eyebrow')}</span>
        <h2 id="loop-dash-title" className="[font:700_24px/1_'Barlow_Condensed'] text-[#F4EDE2]">
          {t('loop.dash.title')}
        </h2>
      </div>
      {loop.status === 'no-wallet' && (
        <>
          <p className="[font:500_14px/1.45_Inter] text-[#C9BFB0]">{t('loop.noWallet.body')}</p>
          <LinkWalletButton className={`${WALLET_BUTTON} self-start`} testId="dash-bounties-connect" />
        </>
      )}
      {loop.status === 'loading' && <div className="h-[96px] animate-pulse rounded-[10px] bg-[#1A1714]" aria-busy="true" aria-label={t('loop.loading')} />}
      {loop.status === 'error' && (
        <div role="alert" className="flex flex-col gap-1">
          <span className="[font:500_14px_Inter] text-[#C9BFB0]">{t('loop.failed')}</span>
          <button type="button" onClick={loop.retry} className={`${LOOP_LINK} self-start`} data-testid="dash-bounties-retry">
            {t('loop.retry')}
          </button>
        </div>
      )}
      {loop.status === 'ready' && loop.capabilities && wallet && (
        <>
          <Link to={`/u/${wallet}`} className="[font:500_12px_JetBrains_Mono] text-[#A0978A] hover:text-[#F4EDE2]" data-testid="dash-bounties-proved">
            {t('loop.proved.summary', { n: loop.capabilities.verifiedCount, total: loop.capabilities.total })} →
          </Link>
          <BountiesOpened view={loop.view} />
        </>
      )}
    </section>
  );
}
