/** What the shop and the wardrobe can do with an item, and the certification an ink or frame is aimed at. */
import type { ReactNode } from 'react';
import type { ShopItem } from '@/types/shop';

export interface ShopActions {
  busy: boolean;
  hasWallet: boolean;
  buy: (item: ShopItem) => void;
  claim: (item: ShopItem) => void;
  equip: (item: ShopItem) => void;
  unequip: (item: ShopItem) => void;
  tryOn: (item: ShopItem) => void;
}

/** A minted certification an ink or a frame can be bought for. */
export interface CertTarget {
  trailId: string;
  title: string;
  daysDone: number;
  totalDays: number;
  tier: string | null;
  credentialId: string | null;
  assetAddress: string | null;
}

/**
 * One group of the wardrobe ("Personalizar"). The page is a list of these: a new kind of thing to
 * choose (a background, an icon colour) is one more entry, with no change to the layout.
 */
export interface WardrobeGroupSpec {
  id: string;
  title: string;
  hint?: string;
  /** Things the learner can choose from in this group; shown on the group's chip. */
  count: number;
  content: ReactNode;
}

/** The one thing an item offers right now, wherever it is drawn. */
export interface ItemAction {
  /** `earn`: nothing to press, the label says how the item is earned. */
  id: 'buy' | 'equip' | 'unequip' | 'claim' | 'inuse' | 'soldout' | 'applied' | 'earn';
  label: string;
  run?: () => void;
  disabled: boolean;
  primary: boolean;
}
