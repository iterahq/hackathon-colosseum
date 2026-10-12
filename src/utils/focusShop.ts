import { FOCUS_SHOP_KINDS, FOCUS_SHOP_ONLY } from '@/config/focus';
import type { ShopItem } from '@/types/shop';

/** `shelf`: what the shop lists. `wardrobe`: what the learner may wear, so what is already owned stays. */
export type FocusShopScope = 'shelf' | 'wardrobe';

const onShelf = (item: ShopItem): boolean => FOCUS_SHOP_KINDS.has(item.kind) && (item.kind !== 'avatar' || item.avatar?.free === true);
const owned = (item: ShopItem): boolean => item.owned && (item.kind === 'avatar' || item.kind === 'outfit');

/** The shop list as the focus build shows it: no paid avatar tier, nothing outside the certification. All of it when the focus is off. */
export function focusShopItems(items: readonly ShopItem[], scope: FocusShopScope, focus: boolean = FOCUS_SHOP_ONLY): ShopItem[] {
  if (!focus) return [...items];
  return items.filter((item) => onShelf(item) || (scope === 'wardrobe' && owned(item)));
}
