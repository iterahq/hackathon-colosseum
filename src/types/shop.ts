/** Shapes of the lives / shop / companion backend, normalised to camelCase by the services. */
import type { PurchaseCircuit } from '@/types/circuit';
import type { AvatarOffer, LearnerAvatar } from '@/types/avatar';
import type { GiftReceipt } from '@/types/gift';

export interface LivesState {
  current: number;
  max: number;
  /** ISO time of the next +1; null while full. */
  nextRegenAt: string | null;
  regenSeconds: number;
  /** ISO time until which no life is lost (the infinite pack); absent or null otherwise. */
  unlimitedUntil?: string | null;
}

export type OutfitKey = 'outfit_glasses' | 'outfit_crown' | 'outfit_headphones' | 'outfit_laurel';

export interface CompanionState {
  assetAddress: string | null;
  mintStatus: string;
  explorerUrl: string | null;
  /** The equipped outfit's item key. */
  outfit: string | null;
  level: number;
  xp: number;
  streak: number;
  /** The on-chain art, exactly as the backend returns it (its `v` parameter is the cache key). */
  imageUrl: string | null;
}

export type ShopItemKind = 'life' | 'outfit' | 'ink' | 'frame' | 'avatar' | 'border' | 'background' | 'app_icon';

export interface InventoryEntry {
  itemKey: string;
  kind: ShopItemKind;
  qty: number;
  equipped: boolean;
}

/** Proof that a state change reached the chain (`chain` of `lives` / `purchase-confirm`). */
export interface ChainProof {
  explorerUrl: string;
  signature: string | null;
  lives: number | null;
}

export interface CompanionSnapshot {
  lives: LivesState;
  companion: CompanionState;
  /** Always present: the default avatar when the learner chose none or the backend sent none. */
  avatar: LearnerAvatar;
  inventory: InventoryEntry[];
  /** The learner's wallet address; null for e-mail users. */
  wallet: string | null;
  /** The last on-chain mirror seen in this session, when the backend reports one. */
  chain?: ChainProof | null;
  /** Answered by the local mock adapter, not by the backend. */
  mocked: boolean;
}

/** What `lives` answers: the two blocks it may have changed, plus the perfect-day bonus when granted. */
export interface LivesUpdate {
  lives: LivesState;
  companion: CompanionState | null;
  bonus: number;
  chain?: ChainProof | null;
}

export interface ShopItem {
  key: string;
  kind: ShopItemKind;
  title: string;
  description: string;
  priceUsdCents: number;
  priceLamports: number;
  priceLabel: string;
  /** Crystal price, shown as a second line; null when the item cannot be bought with crystals. */
  priceCrystals?: number | null;
  /** Which currencies the item can be paid in; an absent flag means enabled. */
  solEnabled?: boolean;
  crystalsEnabled?: boolean;
  /** False for an item that only comes with an avatar (a signature border). */
  forSale?: boolean;
  /** Key of the avatar this item comes with, when it does. */
  includedWith?: string | null;
  /** Hex of a background or an icon colour. */
  color?: string | null;
  /** A border's ring, drawn by the front end. */
  border?: ItemBorder | null;
  /** Set on a life pack (`effect.add_lives` / `effect.unlimited_days`). */
  lifePack?: LifePack | null;
  art: Record<string, unknown>;
  owned: boolean;
  equipped: boolean;
  /** Inks and frames are bought per certification: the trail (unit) ids this one was bought for. */
  ownedRefs: string[];
  /** Present on an item that is also earned: free to claim once the learner reaches `level`. */
  unlock?: ShopUnlock | null;
  /** Present on items of kind `avatar`. */
  avatar?: AvatarOffer | null;
}

/** The ring of a profile border: `border` of a `border` item. */
export interface ItemBorder {
  style: string;
  colors: string[];
  glow: boolean;
  animated: boolean;
}

/** What a life pack gives: lives added (they may go above the maximum) or days without losing any. */
export interface LifePack {
  addLives: number | null;
  unlimitedDays: number | null;
}

export interface ShopUnlock {
  level: number;
  /** Null when nobody is signed in. */
  currentLevel: number | null;
  unlocked: boolean;
}

export interface PurchaseIntent {
  intentId: string;
  /** The serialized transaction MESSAGE: what the wallet signs. */
  messageBase58: string;
  messageBase64: string;
  transactionBase58: string;
  transactionBase64: string;
  priceLamports: number;
  priceUsdCents: number;
  priceLabel: string;
  expiresAt: string | null;
  cluster: string;
  /** The wallet the backend built the transaction for (the account's wallet): the one that has to sign. */
  payer: string | null;
}

/** `pending` is ours: the backend answered a retryable error (the transaction is not visible yet). */
export type PurchaseStatus = 'paid' | 'pending' | 'failed' | 'expired';

/** One attribute the backend wrote to a Core asset (`written` of `purchase-confirm`). */
export interface WrittenAttribute {
  asset: string;
  attribute: string;
  value: string;
}

export interface PurchaseConfirmation {
  status: PurchaseStatus;
  itemKey: string | null;
  lives: LivesState | null;
  companion: CompanionState | null;
  inventory: InventoryEntry[] | null;
  explorerUrl: string | null;
  /** Refreshed companion art (carries its own cache key), when the answer has one. */
  imageUrl?: string | null;
  written?: WrittenAttribute[];
  chain?: ChainProof | null;
  /** Present when the purchase was a gift: who got the life and where it was written. */
  gift?: GiftReceipt | null;
  /** What this purchase paid forward (the Circuito), once its transfer is confirmed. */
  circuit?: PurchaseCircuit | null;
  /** While `pending`: the backend's retryable code (`tx_not_found`, `apply_failed`, `rpc_unavailable`). */
  pendingCode?: string | null;
  /** While `pending`: the payment is already recorded; only the delivery of the item is outstanding. */
  paymentSettled?: boolean;
}

export type FaucetResult = { signature: string; blocked: null } | { signature: null; blocked: string };
