import { useCallback, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { BTN_PRIMARY, BTN_SECONDARY, CARD, FOCUS } from '@/components/shop/shopStyles';
import { isLinkBusy, useLinkWallet, type LinkState } from '@/hooks/useLinkWallet';
import { useI18n } from '@/i18n';
import { LINK_ERROR_CODES, LINK_FINAL_ERRORS } from '@/i18n/linkMessages';
import { addressUrl, shortAddress } from '@/lib/explorer';
import { isTouchBrowser, phantomBrowseUrl } from '@/utils/phantomDeepLink';

/** On a phone the page has to be reopened inside Phantom; on a desktop the extension has to be installed. */
function walletInstallHref(): string {
  return isTouchBrowser()
    ? phantomBrowseUrl(window.location.href, window.location.origin)
    : 'https://phantom.app';
}

const BUSY_KEY = { connecting: 'wallet.link.connecting', signing: 'wallet.link.signing', verifying: 'wallet.link.verifying' } as const;

function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <>
      <h2 className="[font:700_30px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{title}</h2>
      {body && <p className="[font:400_15px/1.5_Inter] text-[#C9BFB0]">{body}</p>}
    </>
  );
}

function Body({ state, start, onClose }: { state: LinkState; start: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const { phase } = state;
  if (phase === 'connecting' || phase === 'signing' || phase === 'verifying') return <TeraLoader size="md" label={t(BUSY_KEY[phase])} />;
  if (phase === 'minting') return <TeraLoader size="md" label={state.remaining ? t('wallet.link.minting', { n: state.remaining }) : t('wallet.link.mintingStart')} />;
  if (phase === 'done' && state.wallet) {
    return (
      <>
        <Heading title={t('wallet.link.done.title')} body={t('wallet.link.done.body')} />
        <div className="flex flex-wrap items-center justify-center gap-3 [font:700_14px_JetBrains_Mono]" data-testid="link-wallet-address">
          <span className="text-[#F4EDE2]" title={state.wallet}>{shortAddress(state.wallet)}</span>
          <a href={addressUrl(state.wallet)} target="_blank" rel="noreferrer" className={`rounded text-[#3FD17F] hover:underline ${FOCUS}`}>
            {t('wallet.link.explorer')} ↗
          </a>
        </div>
        <button type="button" autoFocus onClick={onClose} data-testid="link-wallet-done" className={`${BTN_PRIMARY} mt-1 w-full`}>
          {t('wallet.link.close')}
        </button>
      </>
    );
  }
  if (phase === 'no_wallet') {
    return (
      <>
        <Heading title={t('wallet.link.noWallet.title')} body={t('wallet.link.noWallet.body')} />
        <a href={walletInstallHref()} target="_blank" rel="noreferrer" data-testid="link-wallet-install" className={`${BTN_PRIMARY} w-full`}>
          {t('wallet.link.noWallet.install')}
        </a>
        <button type="button" onClick={onClose} className={`${BTN_SECONDARY} w-full`}>{t('wallet.link.close')}</button>
      </>
    );
  }
  if (phase === 'error') {
    const code = state.code ?? 'generic';
    const final = LINK_FINAL_ERRORS.has(code);
    return (
      <>
        <Heading title={t('wallet.link.error.title')} body={t(LINK_ERROR_CODES.has(code) ? `wallet.link.error.${code}` : 'wallet.link.error.generic')} />
        {!final && (
          <button type="button" autoFocus onClick={start} data-testid="link-wallet-retry" className={`${BTN_PRIMARY} w-full`}>
            {t('wallet.link.retry')}
          </button>
        )}
        <button type="button" onClick={onClose} className={`${BTN_SECONDARY} w-full`}>{t('wallet.link.close')}</button>
      </>
    );
  }
  return (
    <>
      <Heading title={t('wallet.link.title')} body={t('wallet.link.why')} />
      <button type="button" autoFocus onClick={start} data-testid="link-wallet-start" className={`${BTN_PRIMARY} w-full`}>
        {t('wallet.link.start')}
      </button>
      <button type="button" onClick={onClose} className={`${BTN_SECONDARY} w-full`}>{t('wallet.link.close')}</button>
    </>
  );
}

/** The modal that explains and runs the wallet link. Mounted only while open, so each opening starts fresh. */
export function LinkWalletDialog({ onClose: close }: { onClose: () => void }) {
  const reduced = useReducedMotion();
  const { state, start, refresh } = useLinkWallet();
  const { phase, code } = state;
  const onClose = useCallback(() => {
    if (phase === 'done' || code === 'already_linked') refresh();
    close();
  }, [phase, code, refresh, close]);
  const busy = isLinkBusy(state);
  const { t } = useI18n();

  useEffect(() => {
    if (busy) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0A0908]/85 p-4 backdrop-blur-sm" data-testid="link-wallet-dialog" data-phase={state.phase}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-label={t('wallet.link.title')}
        initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={`${CARD} flex w-full max-w-[420px] flex-col items-center gap-4 px-6 pb-6 pt-8 text-center`}
      >
        <Body state={state} start={() => void start()} onClose={onClose} />
      </motion.div>
    </div>
  );
}
