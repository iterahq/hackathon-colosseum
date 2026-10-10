/** Shapes of the lives / shop / companion backend, normalised to camelCase by the services. */
import type { PurchaseCircuit } from '@/types/circuit';
import type { GiftReceipt } from '@/types/gift';

export interface LivesState {
  current: number;
  max: number;
  /** ISO time of the next +1; null while full. */
  nextRegenAt: string | null;
  regenSeconds: number;
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

export type ShopItemKind = 'life' | 'outfit' | 'ink' | 'frame';

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
  art: Record<string, unknown>;
  owned: boolean;
  equipped: boolean;
  /** Inks and frames are bought per certification: the trail (unit) ids this one was bought for. */
  ownedRefs: string[];
  /** Present on an item that is also earned: free to claim once the learner reaches `level`. */
  unlock?: ShopUnlock | null;
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
}

export type FaucetResult = { signature: string; blocked: null } | { signature: null; blocked: string };
