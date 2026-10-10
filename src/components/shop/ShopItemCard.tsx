import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, CARD, MONO_LABEL } from './shopStyles';

interface Props {
  item: ShopItem;
  art: ReactNode;
  /** Extra line under the description (hearts left, the certification picker). */
  children?: ReactNode;
  busy: boolean;
  /** Buying is not possible right now (full lives, no certification to apply to). */
  buyDisabled?: boolean;
  /** Highlights the card while its outfit is on the big Tera. */
  active?: boolean;
  onBuy: () => void;
  /** Present when the item can be taken for free right now (a level unlock). */
  onClaim?: () => void;
  onEquip?: () => void;
  onUnequip?: () => void;
  onPreview?: () => void;
}

/** One thing on the shelf: art, title, description, the backend's price with a devnet badge, and what you can do with it. */
export function ShopItemCard({ item, art, children, busy, buyDisabled = false, active = false, onBuy, onClaim, onEquip, onUnequip, onPreview }: Props) {
  const { t } = useI18n();
  const consumable = item.kind === 'life';
  const owned = item.owned && !consumable;
  const state = owned ? (item.equipped ? 'equipped' : 'owned') : onClaim ? 'claim' : 'buy';

  return (
    <article
      data-testid="shop-item"
      data-item={item.key}
      data-state={state}
      className={`${CARD} flex min-w-0 flex-col overflow-hidden border-b-[5px] transition-colors ${active ? 'border-[#3FD17F]' : 'border-b-[#2E2A25]'}`}
    >
      <button
        type="button"
        onClick={onPreview}
        disabled={!onPreview}
        aria-label={onPreview ? `${t('shop.preview')}: ${item.title}` : undefined}
        className="relative flex h-[132px] items-center justify-center border-b border-[#262320] bg-[#0F0D0B] disabled:cursor-default"
      >
        {art}
        {owned && (
          <span className={`absolute left-3 top-3 rounded-full px-2 py-[3px] ${MONO_LABEL} ${item.equipped ? 'bg-[#3FD17F] text-[#0A0908]' : 'border border-[#3FD17F] text-[#3FD17F]'}`}>
            {item.equipped ? t('shop.equipped') : t('shop.owned')}
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="[font:700_24px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{item.title}</h3>
        <p className="[font:400_14px/1.45_Inter] text-[#C9BFB0]">{item.description}</p>
        {children}
        <div className="mt-auto flex flex-col gap-3 pt-2">
          {state === 'buy' && (
            <span className="flex flex-wrap items-center gap-2">
              <span className="[font:700_13px_JetBrains_Mono] text-[#F4EDE2]" data-testid="shop-price">
                {item.priceLabel}
              </span>
            </span>
          )}
          {state === 'claim' && (
            <button type="button" disabled={busy} onClick={onClaim} data-testid="shop-claim" className={`${BTN_PRIMARY} ${BTN_SMALL} w-full`}>
              {t('shop.claim')}
            </button>
          )}
          {state === 'buy' && (
            <button type="button" disabled={busy || buyDisabled} onClick={onBuy} data-testid="shop-buy" className={`${BTN_PRIMARY} ${BTN_SMALL} w-full`}>
              {t('shop.buyShort')}
            </button>
          )}
          {state === 'owned' && onEquip && (
            <button type="button" disabled={busy} onClick={onEquip} data-testid="shop-equip" className={`${BTN_PRIMARY} ${BTN_SMALL} w-full`}>
              {t('shop.equip')}
            </button>
          )}
          {state === 'equipped' && onUnequip && (
            <button type="button" disabled={busy} onClick={onUnequip} data-testid="shop-unequip" className={`${BTN_SECONDARY} ${BTN_SMALL} w-full`}>
              {t('shop.unequip')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
