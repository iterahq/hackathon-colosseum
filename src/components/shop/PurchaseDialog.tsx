import { useEffect, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import { useI18n } from '@/i18n';
import { PURCHASE_ERROR_CODES } from '@/i18n/shopMessages';
import type { ShopItemKind } from '@/types/shop';
import { isPurchaseBusy, type PurchaseState } from '@/utils/purchaseMachine';
import { BTN_PRIMARY, BTN_SECONDARY, CARD, DEVNET_BADGE, FOCUS } from './shopStyles';

interface Props {
  state: PurchaseState;
  /** Title and kind of the item being bought, for the success line. */
  itemTitle: string;
  itemKind: ShopItemKind;
  /** The outfit Tera wears in the success moment. */
  outfit: string | null;
  onRetry: () => void;
  onFund: () => void;
  onClose: () => void;
}

const BUSY_LABEL = { connecting: 'purchase.connecting', signing: 'purchase.signing', confirming: 'purchase.confirming', funding: 'purchase.funding' } as const;

function Detail({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <code data-testid="purchase-detail" className="block max-h-24 w-full overflow-auto break-words rounded-[8px] border border-[#262320] bg-[#0A0908] px-3 py-2 text-left [font:500_11px/1.5_JetBrains_Mono] text-[#A0978A]">
      {text}
    </code>
  );
}

function Message({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <>
      <h2 className="[font:700_30px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{title}</h2>
      {body && <p className="[font:400_15px/1.5_Inter] text-[#C9BFB0]">{body}</p>}
      {children}
    </>
  );
}

/** Every phase of a wallet purchase in one modal card. Renders nothing at rest; a wallet rejection never opens it. */
export function PurchaseDialog({ state, itemTitle, itemKind, outfit, onRetry, onFund, onClose }: Props) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const busy = isPurchaseBusy(state);
  const open = state.phase !== 'idle';

  useEffect(() => {
    if (!open || busy) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  const { phase } = state;
  const friendly = state.code && PURCHASE_ERROR_CODES.has(state.code) ? t(`purchase.error.${state.code}`) : null;
  const paidLine = itemKind === 'life' ? t('purchase.paid.life') : itemKind === 'outfit' ? t('purchase.paid.outfit', { name: itemTitle }) : t('purchase.paid.item', { name: itemTitle });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0A0908]/85 p-4 backdrop-blur-sm" data-testid="purchase-dialog" data-phase={phase}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-label={itemTitle}
        initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={`${CARD} relative flex w-full max-w-[420px] flex-col items-center gap-4 px-6 pb-6 pt-8 text-center`}
      >
        <span className={`${DEVNET_BADGE} absolute right-4 top-4`}>{t('shop.devnet')}</span>
        {busy && (
          <>
            <TeraLoader size="md" label={t(BUSY_LABEL[phase as keyof typeof BUSY_LABEL])} />
            {phase === 'signing' && <p className="[font:400_14px/1.5_Inter] text-[#A0978A]">{t('purchase.signingHint')}</p>}
          </>
        )}
        {phase === 'paid' && (
          <>
            <span className="flex h-[150px] items-end justify-center">
              <TeraOutfit mood="happy" size="xl" outfit={outfit} />
            </span>
            <Message title={t('purchase.paid.title')} body={paidLine} />
            {state.explorerUrl && (
              <a href={state.explorerUrl} target="_blank" rel="noreferrer" data-testid="purchase-explorer" className={`rounded [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`}>
                {t('purchase.viewTx')}
              </a>
            )}
            <button type="button" autoFocus onClick={onClose} data-testid="purchase-done" className={`${BTN_PRIMARY} mt-1 w-full`}>
              {t('purchase.done')}
            </button>
          </>
        )}
        {(phase === 'failed' || phase === 'insufficient' || phase === 'no_wallet') && (
          <>
            <span className="flex h-[150px] items-end justify-center">
              <TeraOutfit mood="oops" size="xl" outfit={outfit} />
            </span>
            {phase === 'failed' && <Message title={t('purchase.failed.title')} body={friendly ?? t('purchase.failed.body')} />}
            {phase === 'insufficient' && <Message title={t('purchase.insufficient.title')} body={friendly ?? t('purchase.insufficient.body')} />}
            {phase === 'no_wallet' && <Message title={t('purchase.noWallet.title')} body={t('purchase.noWallet.body')} />}
            {phase !== 'no_wallet' && <Detail text={state.detail} />}
            <div className="mt-1 flex w-full flex-col gap-2.5">
              {phase === 'failed' && (
                <button type="button" autoFocus onClick={onRetry} data-testid="purchase-retry" className={`${BTN_PRIMARY} w-full`}>
                  {t('purchase.retry')}
                </button>
              )}
              {phase === 'insufficient' && (
                <button type="button" autoFocus onClick={onFund} data-testid="purchase-faucet" className={`${BTN_PRIMARY} w-full`}>
                  {t('purchase.faucet')}
                </button>
              )}
              <button type="button" onClick={onClose} data-testid="purchase-close" className={`${BTN_SECONDARY} w-full`}>
                {t('purchase.close')}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
