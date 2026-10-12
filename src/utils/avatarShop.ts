/** Pure view-model of the avatar shelf: the rarity pyramid, each avatar's state, and what the learner's look may combine. */
import type { AvatarRarity, LearnerAvatar } from '@/types/avatar';
import type { AvatarPyramid, AvatarState, AvatarTier } from '@/types/avatarShop';
import type { ShopItem } from '@/types/shop';

/** Rarest first: the order the pyramid is drawn in. */
export const RARITY_ORDER: readonly AvatarRarity[] = ['mythic', 'legendary', 'epic', 'rare', 'common'];

const isAvatar = (item: ShopItem) => item.kind === 'avatar' && Boolean(item.avatar);

export function pyramidOf(items: readonly ShopItem[]): AvatarPyramid {
  const avatars = items.filter(isAvatar);
  const paid = avatars.filter((i) => !i.avatar?.free);
  const tiers = RARITY_ORDER.map((rarity): AvatarTier | null => {
    const list = paid.filter((i) => i.avatar?.rarity === rarity);
    const first = list[0]?.avatar;
    if (!first) return null;
    const capped = list.every((i) => i.avatar?.supply.max != null);
    return {
      rarity,
      tierName: first.tierName,
      rarityLabel: first.rarityLabel,
      priceLabel: list[0].priceLabel,
      supply: { minted: list.reduce((n, i) => n + (i.avatar?.supply.minted ?? 0), 0), max: capped ? list.reduce((n, i) => n + (i.avatar?.supply.max ?? 0), 0) : null },
      items: list,
    };
  }).filter((tier): tier is AvatarTier => tier !== null);
  return { tiers, free: avatars.filter((i) => i.avatar?.free) };
}

export function isSoldOut(item: ShopItem): boolean {
  const supply = item.avatar?.supply;
  return supply?.max != null && supply.minted >= supply.max;
}

export function avatarState(item: ShopItem): AvatarState {
  if (item.equipped) return 'equipped';
  if (item.avatar?.free) return 'free';
  if (item.owned) return 'owned';
  if (item.avatar?.earnOnly) return 'earn';
  return isSoldOut(item) ? 'soldout' : 'buy';
}

/** The drawable avatar behind a shop item (a free icon or an NFT avatar). */
export function avatarOf(item: ShopItem): LearnerAvatar | null {
  const offer = item.avatar;
  if (!offer) return null;
  return { key: item.key, title: item.title, rarity: offer.rarity, tierName: offer.tierName, imageUrl: offer.imageUrl, thumbUrl: offer.thumbUrl, chipUrl: offer.chipUrl, assetAddress: offer.assetAddress, allowsOutfit: offer.allowsOutfit, origin: offer.origin ?? null };
}

/** "12/25", or the word for an unlimited tier. */
export const supplyText = (supply: { minted: number; max: number | null }, unlimited: string): string => (supply.max == null ? unlimited : `${supply.minted}/${supply.max}`);
