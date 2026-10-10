import { useEffect, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import { useI18n } from '@/i18n';
import { GIFT_ERROR_CODES } from '@/i18n/giftMessages';
import { PURCHASE_ERROR_CODES as SHOP_ERROR_CODES } from '@/i18n/shopMessages';
import { CopyButton } from '@/components/passport/CopyButton';
import { txUrl } from '@/lib/explorer';
import type { ShopItemKind } from '@/types/shop';
import { giftCopy, lamportsToSol, paidCopy, shortSignature, showTechnicalDetail } from '@/utils/purchaseProof';
import { isPurchaseBusy, type PurchaseState } from '@/utils/purchaseMachine';
import { BTN_PRIMARY, BTN_SECONDARY, CARD, FOCUS } from './shopStyles';

interface Props {
  state: PurchaseState;
  /** Title and kind of the item being bought, for the success line. */
  itemTitle: string;
  itemKind: ShopItemKind;
  /** Name of the certification an ink or frame was applied to. */
  targetTitle?: string | null;
  /** The outfit Tera wears in the success moment. */
  outfit: string | null;
  /** What the success moment shows instead of Tera (a bought avatar). */
  art?: ReactNode;
  /** The next step offered on success ("equip now"); "continue" becomes the quiet key. */
  action?: { label: string; onClick: () => void } | null;
  onRetry: () => void;
  onFund: () => void;
  onClose: () => void;
}

const PURCHASE_ERROR_CODES: ReadonlySet<string> = new Set([...SHOP_ERROR_CODES, ...GIFT_ERROR_CODES]);
/** The test faucet pays 0.01 SOL: it only helps when the whole purchase is about that small. */
const FAUCET_MAX_LAMPORTS = 20_000_000;

const BUSY_LABEL = { connecting: 'purchase.connecting', signing: 'purchase.signing', confirming: 'purchase.confirming', funding: 'purchase.funding' } as const;

function Detail({ text }: { text: string | null }) {
  const { t } = useI18n();
  if (!text) return null;
  return (
    <details className="w-full text-left" data-testid="purchase-details">
      <summary className={`cursor-pointer rounded [font:600_12px_JetBrains_Mono] text-[#A0978A] hover:text-[#F4EDE2] ${FOCUS}`}>{t('purchase.details')}</summary>
      <code data-testid="purchase-detail" className="mt-2 block max-h-24 w-full overflow-auto break-words rounded-[8px] border border-[#262320] bg-[#0A0908] px-3 py-2 select-all [font:500_11px/1.5_JetBrains_Mono] text-[#A0978A]">
        {text}
      </code>
      <CopyButton value={text} label={t('purchase.details.copy')} doneLabel={t('passport.copied')} display={t('purchase.details.copy')} />
    </details>
  );
}

function ProofRow({ label, signature, href, testId }: { label: string; signature: string; href: string; testId: string }) {
  return (
    <div className="flex w-full items-center justify-between gap-3 [font:600_12px_JetBrains_Mono] text-[#A0978A]" data-testid={`${testId}-row`}>
      <span>{label}</span>
      <a href={href} target="_blank" rel="noreferrer" data-testid={testId} className={`rounded text-[#3FD17F] hover:underline ${FOCUS}`}>
        {shortSignature(signature)} ↗
      </a>
    </div>
  );
}

function Proof({ state, copy }: { state: PurchaseState; copy: ReturnType<typeof paidCopy> }) {
  const { t } = useI18n();
  const { proof } = state;
  const signature = proof?.signature ?? null;
  const chain = proof?.chain && proof.chain.signature !== signature ? proof.chain : null;
  const gift = proof?.gift ?? null;
  return (
    <div className="flex w-full flex-col items-center gap-2" data-testid="purchase-proof">
      {proof?.imageUrl && <img src={proof.imageUrl} alt="" width={84} height={84} className="h-[84px] w-[84px] rounded-[10px] border border-[#262320]" data-testid="purchase-art" />}
      {copy.note && <p className="[font:500_13px/1.4_Inter] text-[#C9BFB0]" data-testid="purchase-change">{t(copy.note.key, copy.note.params)}</p>}
      {proof?.circuitStamps ? <p className="[font:600_13px/1.4_Inter] text-[#3FD17F]" data-testid="purchase-circuit">{t('circuit.purchase', { n: proof.circuitStamps })}</p> : null}
      {signature && <ProofRow label={t('purchase.row.payment')} signature={signature} href={state.explorerUrl ?? txUrl(signature)} testId="purchase-explorer" />}
      {chain && <ProofRow label={gift ? t('gift.row.chain', { name: gift.name }) : t('purchase.row.chain')} signature={chain.signature} href={chain.explorerUrl} testId="purchase-chain-explorer" />}
      {gift && !chain && gift.companionExplorerUrl && (
        <a href={gift.companionExplorerUrl} target="_blank" rel="noreferrer" data-testid="purchase-gift-companion" className={`rounded [font:600_12px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`}>
          {t('gift.row.companion')} ↗
        </a>
      )}
    </div>
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
export function PurchaseDialog({ state, itemTitle, itemKind, targetTitle = null, outfit, art, action = null, onRetry, onFund, onClose }: Props) {
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
  const gift = state.proof?.gift ?? null;
  const copy = gift ? giftCopy(gift) : paidCopy(itemKind, { itemTitle, targetTitle }, state.proof);
  const faucetHelps = !state.neededLamports || state.neededLamports <= FAUCET_MAX_LAMPORTS;
  const needed = state.neededLamports ? t('purchase.insufficient.need', { amount: lamportsToSol(state.neededLamports) }) : null;

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
        {busy && (
          <>
            <TeraLoader size="md" label={t(BUSY_LABEL[phase as keyof typeof BUSY_LABEL])} />
            {phase === 'signing' && <p className="[font:400_14px/1.5_Inter] text-[#A0978A]">{t('purchase.signingHint')}</p>}
          </>
        )}
        {phase === 'paid' && (
          <>
            <span className="flex h-[150px] items-end justify-center" data-testid="purchase-stage">
              {art ?? <TeraOutfit mood="happy" size="xl" outfit={outfit} />}
            </span>
            <Message title={gift ? t('gift.paid.title', { name: gift.name }) : t('purchase.paid.title')} body={t(copy.body.key, copy.body.params)} />
            <Proof state={state} copy={copy} />
            {action && (
              <button type="button" autoFocus onClick={action.onClick} data-testid="purchase-next" className={`${BTN_PRIMARY} mt-1 w-full`}>
                {action.label}
              </button>
            )}
            <button type="button" autoFocus={!action} onClick={onClose} data-testid="purchase-done" className={`${action ? BTN_SECONDARY : `${BTN_PRIMARY} mt-1`} w-full`}>
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
            {phase === 'insufficient' && <Message title={t('purchase.insufficient.title')} body={faucetHelps ? (needed ?? friendly ?? t('purchase.insufficient.body')) : `${needed ?? ''} ${t('purchase.insufficient.showcase')}`.trim()} />}
            {phase === 'no_wallet' && <Message title={t('purchase.noWallet.title')} body={t('purchase.noWallet.body')} />}
            {showTechnicalDetail(phase, state.code, PURCHASE_ERROR_CODES) && <Detail text={state.detail} />}
            <div className="mt-1 flex w-full flex-col gap-2.5">
              {phase === 'failed' && (
                <button type="button" autoFocus onClick={onRetry} data-testid="purchase-retry" className={`${BTN_PRIMARY} w-full`}>
                  {t('purchase.retry')}
                </button>
              )}
              {phase === 'insufficient' && faucetHelps && (
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
