/** Shapes of the lives / shop / companion backend, normalised to camelCase by the services. */
export interface LivesState {
  current: number;
  max: number;
  /** ISO time of the next +1; null while full. */
  nextRegenAt: string | null;
  regenSeconds: number;
}

export type OutfitKey = 'outfit_glasses' | 'outfit_crown' | 'outfit_headphones';

export interface CompanionState {
  assetAddress: string | null;
  mintStatus: string;
  explorerUrl: string | null;
  /** The equipped outfit's item key. */
  outfit: string | null;
  level: number;
  xp: number;
  streak: number;
}

export type ShopItemKind = 'life' | 'outfit' | 'ink' | 'frame';

export interface InventoryEntry {
  itemKey: string;
  kind: ShopItemKind;
  qty: number;
  equipped: boolean;
}

export interface CompanionSnapshot {
  lives: LivesState;
  companion: CompanionState;
  inventory: InventoryEntry[];
  /** The learner's wallet address; null for e-mail users. */
  wallet: string | null;
  /** Answered by the local mock adapter, not by the backend. */
  mocked: boolean;
}

/** What `lives` answers: the two blocks it may have changed, plus the perfect-day bonus when granted. */
export interface LivesUpdate {
  lives: LivesState;
  companion: CompanionState | null;
  bonus: number;
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
}

export interface PurchaseIntent {
  intentId: string;
  /** The serialized transaction MESSAGE: what the wallet signs. */
  messageBase58: string;
  transactionBase58: string;
  transactionBase64: string;
  priceLamports: number;
  priceUsdCents: number;
  priceLabel: string;
  expiresAt: string | null;
  cluster: string;
}

export type PurchaseStatus = 'paid' | 'pending' | 'failed' | 'expired';

export interface PurchaseConfirmation {
  status: PurchaseStatus;
  itemKey: string | null;
  lives: LivesState | null;
  companion: CompanionState | null;
  inventory: InventoryEntry[] | null;
  explorerUrl: string | null;
}

export type FaucetResult = { signature: string; blocked: null } | { signature: null; blocked: string };
