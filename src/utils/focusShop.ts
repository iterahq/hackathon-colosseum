import { FOCUS_PAID_TERAS_OFF, FOCUS_SHOP_KINDS, FOCUS_SHOP_ONLY, FOCUS_STARTER_FACES_UNLISTED } from '@/config/focus';
import type { ShopItem } from '@/types/shop';

/** `shelf`: what the shop lists. `wardrobe`: what the learner may wear, so what is already owned stays. */
export type FocusShopScope = 'shelf' | 'wardrobe';

const onShelf = (item: ShopItem): boolean => FOCUS_SHOP_KINDS.has(item.kind);
const wearable = (item: ShopItem): boolean => (item.kind === 'avatar' ? item.owned || item.avatar?.free === true : onShelf(item) || (item.owned && item.kind === 'outfit'));

/** A Tera of a tier that is for sale: not a free face, not an earn-only tier. */
export const isPaidTera = (item: Pick<ShopItem, 'kind' | 'avatar'>): boolean => item.kind === 'avatar' && Boolean(item.avatar) && item.avatar?.free !== true && item.avatar?.earnOnly !== true;

/** With the paid shelf off, a Tera for sale the learner does not own is not offered anywhere: not listed, not buyable. */
export const isHiddenPaidTera = (item: Pick<ShopItem, 'kind' | 'avatar' | 'owned'>, paidOff: boolean = FOCUS_PAID_TERAS_OFF): boolean => paidOff && isPaidTera(item) && !item.owned;

/** A face every learner starts with: it has no price and no asset. */
export const isStarterFace = (item: Pick<ShopItem, 'kind' | 'avatar'>): boolean => item.kind === 'avatar' && item.avatar?.free === true;

/**
 * The shop list as the focus build shows it. The shelf: the certification cosmetics and the Teras (the tiers for sale
 * unless the paid shelf is off, when only an owned one stays; the earn-only tiers listed with no price; the starter
 * faces only when they are listed). The wardrobe: what the learner may wear, so a Tera is there only when it is a
 * starter face or owned. All of it when the focus is off.
 */
export function focusShopItems(items: readonly ShopItem[], scope: FocusShopScope, focus: boolean = FOCUS_SHOP_ONLY, paidOff: boolean = FOCUS_PAID_TERAS_OFF, startersUnlisted: boolean = FOCUS_STARTER_FACES_UNLISTED): ShopItem[] {
  if (!focus) return [...items];
  return items.filter((item) => (scope === 'shelf' ? onShelf(item) && !(startersUnlisted && isStarterFace(item)) : wearable(item)) && !isHiddenPaidTera(item, paidOff));
}
