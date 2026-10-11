import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { useCompanion } from '@/hooks/useCompanion';
import { useLoopView } from '@/hooks/useLoopView';
import { useI18n } from '@/i18n';
import { BountiesOpened } from './BountiesOpened';
import { LOOP_LABEL, LOOP_LINK, LOOP_PANEL } from './loopStyles';
import { ProvedToday } from './ProvedToday';

const WALLET_BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-full bg-[#3FD17F] px-5 [font:700_14px_Inter] text-[#0A0908] hover:bg-[#5BE095]';

/** The body of the loop panel; `LoopPanel` wraps it so a failure here never takes the ceremony down with it. */
export function LoopPanelBody({ trail, day }: { trail?: number | null; day?: number | null }) {
  const { t } = useI18n();
  const { wallet } = useCompanion();
  const loop = useLoopView(wallet ?? null);

  if (loop.status === 'no-wallet') {
    return (
      <section className={`${LOOP_PANEL} flex flex-col gap-3`} data-testid="loop-panel" data-state="no-wallet">
        <span className={LOOP_LABEL}>{t('loop.opened.title')}</span>
        <span className="[font:700_22px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t('loop.noWallet.title')}</span>
        <p className="[font:500_14px/1.45_Inter] text-[#C9BFB0]">{t('loop.noWallet.body')}</p>
        <LinkWalletButton className={`${WALLET_BUTTON} self-start`} testId="loop-connect" />
      </section>
    );
  }
  if (loop.status === 'loading') {
    return <div className={`${LOOP_PANEL} h-[160px] animate-pulse`} aria-busy="true" aria-label={t('loop.loading')} data-testid="loop-panel" data-state="loading" />;
  }
  if (loop.status === 'error' || !loop.capabilities || !wallet) {
    return (
      <section role="alert" className={`${LOOP_PANEL} flex flex-col gap-2`} data-testid="loop-panel" data-state="error">
        <span className="[font:500_14px_Inter] text-[#C9BFB0]">{t('loop.failed')}</span>
        <button type="button" onClick={loop.retry} className={`${LOOP_LINK} self-start`} data-testid="loop-retry">
          {t('loop.retry')}
        </button>
      </section>
    );
  }
  return (
    <div className={`${LOOP_PANEL} grid gap-6 sm:grid-cols-2`} data-testid="loop-panel" data-state="ready">
      <ProvedToday capabilities={loop.capabilities} trail={trail} day={day} wallet={wallet} />
      <BountiesOpened view={loop.view} />
    </div>
  );
}
