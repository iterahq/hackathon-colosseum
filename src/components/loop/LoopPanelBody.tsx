import { LinkWalletButton } from '@/components/wallet/LinkWalletButton';
import { FOCUS_EARN_STORY_OFF } from '@/config/focus';
import { useCompanion } from '@/hooks/useCompanion';
import { useLoopView } from '@/hooks/useLoopView';
import { useStampRead } from '@/hooks/useStampRead';
import { useI18n } from '@/i18n';
import type { StampExpectation } from '@/types/loop';
import { BountiesOpened } from './BountiesOpened';
import { InstantBountyLink } from './InstantBountyLink';
import { LOOP_LABEL, LOOP_LINK, LOOP_PANEL } from './loopStyles';
import { ProvedToday } from './ProvedToday';

const WALLET_BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-full bg-[#3FD17F] px-5 [font:700_14px_Inter] text-[#0A0908] hover:bg-[#5BE095]';

/** The body of the loop panel; `LoopPanel` wraps it so a failure here never takes the ceremony down with it. */
export function LoopPanelBody({ trail, day, stamp = null }: { trail?: number | null; day?: number | null; stamp?: StampExpectation | null }) {
  const { t, locale } = useI18n();
  const { wallet } = useCompanion();
  const stampRead = useStampRead(wallet ?? null, locale, stamp);
  const loop = useLoopView(wallet ?? null, { stamped: stampRead.profile });

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
  if (stampRead.state === 'reading') {
    return (
      <section className={`${LOOP_PANEL} flex min-h-[160px] flex-col justify-center gap-2`} aria-busy="true" data-testid="loop-panel" data-state="reading">
        <span className={LOOP_LABEL}>{t('loop.proved.title')}</span>
        <span className="animate-pulse [font:700_22px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t('loop.reading')}</span>
      </section>
    );
  }
  if (stampRead.state === 'behind') {
    return (
      <section role="status" className={`${LOOP_PANEL} flex flex-col gap-2`} data-testid="loop-panel" data-state="behind">
        <span className={LOOP_LABEL}>{t('loop.proved.title')}</span>
        <p className="[font:500_14px/1.45_Inter] text-[#C9BFB0]">{t('loop.behind')}</p>
        <button type="button" onClick={stampRead.retry} className={`${LOOP_LINK} self-start`} data-testid="loop-reread">
          {t('loop.reread')}
        </button>
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
    <div className={`${LOOP_PANEL} flex flex-col gap-5`} data-testid="loop-panel" data-state="ready">
      {!FOCUS_EARN_STORY_OFF && loop.view.instant && <InstantBountyLink opening={loop.view.instant} />}
      <div className={`grid gap-6 ${FOCUS_EARN_STORY_OFF ? '' : 'sm:grid-cols-2'}`}>
        <ProvedToday capabilities={loop.capabilities} trail={trail} day={day} wallet={wallet} />
        {!FOCUS_EARN_STORY_OFF && <BountiesOpened view={loop.view} />}
      </div>
    </div>
  );
}
