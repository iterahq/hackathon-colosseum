import { useId, useState, type ReactNode } from 'react';
import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import type { ShopActions } from '@/types/shopView';
import { itemAction } from './itemAction';
import { ShopExplainer } from './ShopExplainer';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, BTN_TEXT, CARD, FOCUS, MONO_LABEL } from './shopStyles';

interface Props {
  item: ShopItem;
  art: ReactNode;
  actions: ShopActions;
  /** Extra line under the description (an unlock bar, why buying is off). */
  children?: ReactNode;
  /** Buying is not possible right now (full lives, no certification to apply to). */
  buyDisabled?: boolean;
  /** This kind has something to try on (a refill has not). */
  tryable?: boolean;
}

const TEST_ID = { buy: 'shop-buy', equip: 'shop-equip', unequip: 'shop-unequip', claim: 'shop-claim', inuse: 'shop-inuse', soldout: 'shop-soldout', applied: 'shop-applied' } as const;

/** One thing on the shelf: art, title, the backend's price, ONE green action, "try on" beside it and a "?" that says what it changes. */
export function ShopItemCard({ item, art, actions, children, buyDisabled = false, tryable = true }: Props) {
  const { t } = useI18n();
  const [explaining, setExplaining] = useState(false);
  const explainerId = useId();
  const action = itemAction(item, actions, t, { buyDisabled });
  const owned = item.owned && item.kind !== 'life';
  const state = owned ? (item.equipped ? 'equipped' : 'owned') : action.id === 'claim' ? 'claim' : 'buy';

  return (
    <article data-testid="shop-item" data-item={item.key} data-state={state} className={`${CARD} flex min-w-0 flex-col overflow-hidden border-b-[5px] ${item.equipped && owned ? 'border-b-[#3FD17F]' : 'border-b-[#2E2A25]'}`}>
      <div className="relative">
        <button
          type="button"
          onClick={() => actions.tryOn(item)}
          disabled={!tryable}
          aria-label={tryable ? `${t('shop.preview')}: ${item.title}` : undefined}
          data-testid="shop-art"
          className={`flex h-[132px] w-full items-center justify-center border-b border-[#262320] bg-[#0F0D0B] disabled:cursor-default ${FOCUS}`}
        >
          {art}
        </button>
        {owned && (
          <span className={`pointer-events-none absolute left-3 top-3 rounded-full px-2 py-[3px] ${MONO_LABEL} ${item.equipped ? 'bg-[#3FD17F] text-[#0A0908]' : 'border border-[#3FD17F] text-[#3FD17F]'}`}>
            {item.equipped ? t('shop.equipped') : t('shop.owned')}
          </span>
        )}
        <button
          type="button"
          onClick={() => setExplaining((v) => !v)}
          aria-expanded={explaining}
          aria-controls={explainerId}
          aria-label={`${t('explain.toggle')}: ${item.title}`}
          title={t('explain.toggle')}
          data-testid="shop-explain"
          className={`absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full border [font:700_16px_JetBrains_Mono] ${explaining ? 'border-[#3FD17F] text-[#3FD17F]' : 'border-[#2E2A25] text-[#A0978A] hover:text-[#F4EDE2]'} bg-[#141210] ${FOCUS}`}
        >
          ?
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="[font:700_24px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{item.title}</h3>
          {action.id === 'buy' && (
            <span className="flex-none text-right [font:700_12px/1.3_JetBrains_Mono] text-[#F4EDE2]" data-testid="shop-price">
              {item.priceLabel}
            </span>
          )}
        </div>
        <p className="[font:400_14px/1.45_Inter] text-[#C9BFB0]">{item.description}</p>
        {children}
        <div id={explainerId} hidden={!explaining}>
          {explaining && <ShopExplainer item={item} />}
        </div>
        <div className="mt-auto flex items-center gap-2 pt-2">
          <button type="button" disabled={action.disabled} onClick={action.run} data-testid={TEST_ID[action.id]} className={`${action.primary ? BTN_PRIMARY : BTN_SECONDARY} ${BTN_SMALL} flex-1`}>
            {action.label}
          </button>
          {tryable && (
            <button type="button" onClick={() => actions.tryOn(item)} data-testid="shop-tryon" className={BTN_TEXT}>
              {t('shop.preview')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
