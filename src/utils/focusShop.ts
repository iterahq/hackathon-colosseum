import { FOCUS_SHOP_KINDS, FOCUS_SHOP_ONLY } from '@/config/focus';
import type { ShopItem } from '@/types/shop';

/** `shelf`: what the shop lists. `wardrobe`: what the learner may wear, so what is already owned stays. */
export type FocusShopScope = 'shelf' | 'wardrobe';

const onShelf = (item: ShopItem): boolean => FOCUS_SHOP_KINDS.has(item.kind);
const wearable = (item: ShopItem): boolean => (item.kind === 'avatar' ? item.owned || item.avatar?.free === true : onShelf(item) || (item.owned && item.kind === 'outfit'));

/**
 * The shop list as the focus build shows it. The shelf: the certification cosmetics and every Tera (the free faces, the
 * tiers for sale, and the earn-only tiers, listed with no price). The wardrobe: what the learner may wear, so a Tera
 * is there only when it is free or owned. All of it when the focus is off.
 */
export function focusShopItems(items: readonly ShopItem[], scope: FocusShopScope, focus: boolean = FOCUS_SHOP_ONLY): ShopItem[] {
  if (!focus) return [...items];
  return items.filter(scope === 'shelf' ? onShelf : wearable);
}
