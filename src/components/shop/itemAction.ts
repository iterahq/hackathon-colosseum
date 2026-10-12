import type { ShopItem } from '@/types/shop';
import type { ItemAction, ShopActions } from '@/types/shopView';
import { avatarState } from '@/utils/avatarShop';
import { isOffSeason } from './avatarRows';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** THE one thing an item offers right now. Every surface (tile, card, try-on dialog, wardrobe) asks here. */
export function itemAction(item: ShopItem, actions: ShopActions, t: Translate, { buyDisabled = false, withPrice = false }: { buyDisabled?: boolean; withPrice?: boolean } = {}): ItemAction {
  const buy: ItemAction = { id: 'buy', label: withPrice ? t('tryon.buy', { price: item.priceLabel }) : t('shop.buyShort'), run: () => actions.buy(item), disabled: actions.busy || buyDisabled, primary: true };
  const equip: ItemAction = { id: 'equip', label: t('wardrobe.equip'), run: () => actions.equip(item), disabled: actions.busy, primary: true };
  const inUse: ItemAction = { id: 'inuse', label: t('wardrobe.inUse'), disabled: true, primary: false };

  if (item.kind === 'avatar') {
    const state = avatarState(item);
    if (state === 'equipped') return inUse;
    if (state === 'free' || state === 'owned') return equip;
    if (state === 'earn') return { id: 'earn', label: t('shelf.earn.how'), disabled: true, primary: false };
    if (state === 'soldout') return { id: 'soldout', label: t('shop.avatar.soldOut'), disabled: true, primary: false };
    if (isOffSeason(item)) return { id: 'soldout', label: t('shop.season.out'), disabled: true, primary: false };
    return buy;
  }
  if (item.kind === 'outfit') {
    if (item.owned && item.equipped) return { id: 'unequip', label: t('wardrobe.takeOff'), run: () => actions.unequip(item), disabled: actions.busy, primary: false };
    if (item.owned) return equip;
    if (item.unlock?.unlocked) return { id: 'claim', label: t('shop.claim'), run: () => actions.claim(item), disabled: actions.busy, primary: true };
    return buy;
  }
  if (item.kind === 'border' || item.kind === 'background' || item.kind === 'app_icon') {
    // Equipping these happens in the wardrobe; here they are owned or for sale.
    if (item.owned) return { id: item.equipped ? 'inuse' : 'applied', label: t(item.equipped ? 'wardrobe.inUse' : 'shop.owned'), disabled: true, primary: false };
    if (item.forSale === false) return { id: 'soldout', label: t('shop.swatch.signature'), disabled: true, primary: false };
    return buy;
  }
  if ((item.kind === 'ink' || item.kind === 'frame') && item.owned) return { id: 'applied', label: t('shop.equipped'), disabled: true, primary: false };
  return buy;
}
