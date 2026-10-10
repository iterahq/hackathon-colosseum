/** View-model of the avatar shelf of the shop: the rarity pyramid and the state of one avatar. */
import type { AvatarRarity } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';

export type AvatarState = 'equipped' | 'owned' | 'free' | 'soldout' | 'buy';

export interface AvatarTier {
  rarity: AvatarRarity;
  tierName: string;
  rarityLabel: string;
  priceLabel: string;
  /** Minted and cap summed over the tier; `max` null when any avatar of the tier is unlimited. */
  supply: { minted: number; max: number | null };
  items: ShopItem[];
}

export interface AvatarPyramid {
  tiers: AvatarTier[];
  free: ShopItem[];
}

/** Name and story of one avatar, in the viewer's language. */
