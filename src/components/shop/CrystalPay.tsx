import { createContext, useContext, type ReactNode } from 'react';
import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import type { ItemAction } from '@/types/shopView';
import { shortPrice } from './avatarRows';
import { crystalsEnabled, formatCount, solEnabled } from './pay';
import { BTN_PRIMARY } from './shopStyles';
import type { CrystalFailure } from './useCrystalPurchase';

/** The crystal action reaches every card through here: `onPayWithCrystals(item, refId?)`. Without a provider no crystal button is drawn. */
export interface CrystalPay {
  onPayWithCrystals: (item: ShopItem, refId?: string) => void;
  busy: boolean;
  /** The learner's crystal balance when known: a key is off, with the reason, when it is short. */
  balance?: number | null;
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
  labels?: 'full' | 'mid' | 'short';
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
  const { t, locale } = useI18n();
  const ctx = useCrystalPay();
  const crystals = Boolean(ctx) && crystalsEnabled(item);
  const priceN = formatCount(item.priceCrystals ?? 0, locale);
  const short = ctx?.balance != null && ctx.balance < (item.priceCrystals ?? 0);
  const reason = short ? t('shop.pay.short', { balance: formatCount(ctx?.balance ?? 0, locale), price: priceN }) : undefined;
  const wallet = solEnabled(item) || !crystals;
  const price = shortPrice(item.priceLabel);
  const key = `${BTN_PRIMARY} !min-h-9 min-w-0 flex-1 whitespace-nowrap !px-1.5 ![font:700_12px_Inter] ${keyClass}`;
  const walletText = !crystals ? walletLabel : labels === 'full' ? t('shop.pay.wallet', { price }) : labels === 'mid' ? t('shop.pay.walletMid', { price }) : price;
  const crystalText = labels === 'full' ? t('shop.pay.crystals', { n: priceN }) : labels === 'mid' ? t('shop.pay.crystalsMid', { n: priceN }) : t('shop.pay.crystalsShort', { n: priceN });

  return (
    <div className={`flex w-full flex-wrap gap-1.5 ${stack ? 'flex-col' : ''} ${className}`} data-testid={`${testId}-pay`}>
      {wallet && (
        <button type="button" disabled={action.disabled} onClick={action.run} aria-label={crystals ? t('shop.pay.wallet', { price: item.priceLabel }) : undefined} title={crystals ? t('shop.pay.wallet', { price: item.priceLabel }) : undefined} data-autofocus={autoFocus || undefined} data-testid={testId} data-action={action.id} className={key}>
          {walletText}
        </button>
      )}
      {crystals && ctx && (
        <button type="button" disabled={action.disabled || ctx.busy || short} onClick={() => ctx.onPayWithCrystals(item, ctx.refId)} aria-label={reason ? `${t('shop.pay.crystals', { n: priceN })}. ${reason}` : t('shop.pay.crystals', { n: priceN })} title={reason ?? t('shop.pay.crystals', { n: priceN })} data-short={short || undefined} data-testid={`${testId}-crystals`} className={key}>
          {crystalText}
        </button>
      )}
      {crystals && labels === 'full' && ctx?.balance != null && (
        <p className={`w-full [font:600_12px/1.3_JetBrains_Mono] ${short ? 'text-[#E0A86F]' : 'text-[#A0978A]'}`} data-testid={`${testId}-balance`}>
          {t('shop.pay.balance', { n: formatCount(ctx.balance, locale) })}
        </p>
      )}
    </div>
  );
}

/** Says why a crystal purchase did not go through: the balance against the price. */
export function CrystalNotice({ failure, onClose }: { failure: CrystalFailure | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  if (!failure) return null;
  const text = t('shop.crystals.insufficient', { balance: formatCount(failure.balance, locale), price: formatCount(failure.price, locale) });
  return (
    <div role="alert" className="fixed inset-x-4 bottom-4 z-[70] mx-auto flex max-w-[480px] items-center gap-3 rounded-[14px] border border-[#E0A86F] bg-[#141210] p-4 shadow-xl" data-testid="crystal-notice" data-code={failure.code}>
      <p className="flex-1 [font:600_14px/1.4_Inter] text-[#F4EDE2]">{text}</p>
      <button type="button" onClick={onClose} className="min-h-11 rounded-[10px] px-3 [font:700_13px_JetBrains_Mono] text-[#3FD17F]">
        OK
      </button>
    </div>
  );
}
