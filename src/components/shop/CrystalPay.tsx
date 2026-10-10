import { createContext, useContext, type ReactNode } from 'react';
import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import type { ItemAction } from '@/types/shopView';
import { shortPrice } from './avatarRows';
import { crystalsEnabled, solEnabled } from './pay';
import { BTN_PRIMARY } from './shopStyles';
import type { CrystalFailure } from './useCrystalPurchase';

/** The crystal action reaches every card through here: `onPayWithCrystals(item, refId?)`. Without a provider no crystal button is drawn. */
export interface CrystalPay {
  onPayWithCrystals: (item: ShopItem, refId?: string) => void;
  busy: boolean;
  /** The certification an ink or a frame is aimed at. */
  refId?: string;
}

const Context = createContext<CrystalPay | null>(null);
export const CrystalPayProvider = ({ value, children }: { value: CrystalPay | null; children: ReactNode }) => <Context.Provider value={value}>{children}</Context.Provider>;
export const useCrystalPay = (): CrystalPay | null => useContext(Context);

interface Props {
  item: ShopItem;
  /** The wallet action (`id: 'buy'`) from `itemAction`; its `run`, `disabled` and label are the legacy single button. */
  action: ItemAction;
  testId: string;
  /** `full`: "Pagar com a wallet · US$ 0.20"; `short`: just the price. */
  labels?: 'full' | 'short';
  /** What the lone wallet button says when crystals are not on offer (today's label). */
  walletLabel: string;
  stack?: boolean;
  className?: string;
  /** Extra classes of the keys. */
  keyClass?: string;
  /** The wallet key takes focus when a dialog opens. */
  autoFocus?: boolean;
}

/** True when this item can be paid in both currencies right now: the layout then needs room for two keys. */
export function useDualPay(item: ShopItem): boolean {
  const ctx = useCrystalPay();
  return Boolean(ctx) && solEnabled(item) && crystalsEnabled(item);
}

/**
 * The pay actions of an item, side by side: wallet and crystals. Only the enabled ones are drawn, and a lone
 * key takes the whole width, so a single currency leaves no hole. With no crystal price it is today's one key.
 */
export function PayButtons({ item, action, testId, labels = 'short', walletLabel, stack = false, className = '', keyClass = '', autoFocus = false }: Props) {
  const { t } = useI18n();
  const ctx = useCrystalPay();
  const crystals = Boolean(ctx) && crystalsEnabled(item);
  const wallet = solEnabled(item) || !crystals;
  const price = shortPrice(item.priceLabel);
  const key = `${BTN_PRIMARY} !min-h-9 min-w-0 flex-1 !px-1.5 ![font:700_12px_Inter] ${keyClass}`;
  const walletText = !crystals ? walletLabel : labels === 'full' ? t('shop.pay.wallet', { price }) : price;
  const crystalText = labels === 'full' ? t('shop.pay.crystals', { n: item.priceCrystals ?? 0 }) : t('shop.pay.crystalsShort', { n: item.priceCrystals ?? 0 });

  return (
    <div className={`flex w-full gap-1.5 ${stack ? 'flex-col' : ''} ${className}`} data-testid={`${testId}-pay`}>
      {wallet && (
        <button type="button" disabled={action.disabled} onClick={action.run} aria-label={crystals ? t('shop.pay.wallet', { price: item.priceLabel }) : undefined} title={crystals ? t('shop.pay.wallet', { price: item.priceLabel }) : undefined} data-autofocus={autoFocus || undefined} data-testid={testId} data-action={action.id} className={key}>
          {walletText}
        </button>
      )}
      {crystals && ctx && (
        <button type="button" disabled={action.disabled || ctx.busy} onClick={() => ctx.onPayWithCrystals(item, ctx.refId)} aria-label={t('shop.pay.crystals', { n: item.priceCrystals ?? 0 })} title={t('shop.pay.crystals', { n: item.priceCrystals ?? 0 })} data-testid={`${testId}-crystals`} className={key}>
          {crystalText}
        </button>
      )}
    </div>
  );
}

/** Says why a crystal purchase did not go through: the balance against the price. */
export function CrystalNotice({ failure, onClose }: { failure: CrystalFailure | null; onClose: () => void }) {
  const { t } = useI18n();
  if (!failure) return null;
  const text = failure.code === 'insufficient_crystals' ? t('shop.crystals.insufficient', { balance: failure.balance ?? 0, price: failure.price }) : failure.code === 'not_wired' ? t('shop.crystals.notWired') : t('shop.crystals.failed');
  return (
    <div role="alert" className="fixed inset-x-4 bottom-4 z-[70] mx-auto flex max-w-[480px] items-center gap-3 rounded-[14px] border border-[#E0A86F] bg-[#141210] p-4 shadow-xl" data-testid="crystal-notice" data-code={failure.code}>
      <p className="flex-1 [font:600_14px/1.4_Inter] text-[#F4EDE2]">{text}</p>
      <button type="button" onClick={onClose} className="min-h-11 rounded-[10px] px-3 [font:700_13px_JetBrains_Mono] text-[#3FD17F]">
        OK
      </button>
    </div>
  );
}
