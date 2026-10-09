/** Wire (snake_case, loosely typed) -> app types for the lives / shop / companion functions. One file to fix when a shape moves. */
import type {
  CompanionSnapshot,
  CompanionState,
  FaucetResult,
  InventoryEntry,
  LivesState,
  LivesUpdate,
  PurchaseConfirmation,
  PurchaseIntent,
  PurchaseStatus,
  ShopItem,
  ShopItemKind,
} from '@/types/shop';
import { DEFAULT_MAX_LIVES, DEFAULT_REGEN_SECONDS } from '@/utils/lives';
import { priceLabel } from '@/utils/shopPrice';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const orNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const KINDS: readonly ShopItemKind[] = ['life', 'outfit', 'ink', 'frame'];
const kindOf = (v: unknown): ShopItemKind => (KINDS.includes(v as ShopItemKind) ? (v as ShopItemKind) : 'outfit');
const STATUSES: readonly PurchaseStatus[] = ['paid', 'pending', 'failed', 'expired'];

/** Null when the block is absent or has no usable counter: callers treat that as "no lives backend". */
export function toLives(v: unknown): LivesState | null {
  const r = row(v);
  if (typeof r.current !== 'number') return null;
  const max = Math.max(1, num(r.max, DEFAULT_MAX_LIVES));
  const current = Math.min(max, Math.max(0, Math.floor(r.current)));
  // `regen_seconds` is the time LEFT to the next life; the length of a tick is `regen_interval_seconds`.
  const left = num(r.regen_seconds);
  const nextRegenAt = current >= max ? null : (orNull(r.next_regen_at) ?? (left > 0 ? new Date(Date.now() + left * 1000).toISOString() : null));
  return { current, max, nextRegenAt, regenSeconds: num(r.regen_interval_seconds, DEFAULT_REGEN_SECONDS) };
}

export function toCompanion(v: unknown): CompanionState {
  const r = row(v);
  return {
    assetAddress: orNull(r.asset_address),
    mintStatus: str(r.mint_status) || 'unclaimed',
    explorerUrl: orNull(r.explorer_url),
    outfit: orNull(r.outfit),
    level: num(r.level, 1),
    xp: num(r.xp),
    streak: num(r.streak),
  };
}

export function toInventory(v: unknown): InventoryEntry[] {
  return rows(v)
    .map((r) => ({ itemKey: str(r.item_key), kind: kindOf(r.kind), qty: num(r.qty, 1), equipped: r.equipped === true }))
    .filter((e) => e.itemKey);
}

const walletOfWire = (v: unknown): string | null => orNull(v) ?? orNull(row(v).address);

export function toSnapshot(v: unknown, mocked: boolean): CompanionSnapshot {
  const r = row(v);
  const lives = toLives(r.lives);
  if (!lives) throw new Error('companion: no lives block in the answer');
  return { lives, companion: toCompanion(r.companion), inventory: toInventory(r.inventory), wallet: walletOfWire(r.wallet), mocked };
}

export function toLivesUpdate(v: unknown): LivesUpdate {
  const r = row(v);
  const lives = toLives(r.lives);
  if (!lives) throw new Error('lives: no lives block in the answer');
  // `bonus` is a verdict (`granted | already_granted | mistakes | lesson_incomplete | full`): only `granted` adds a life.
  const bonus = r.bonus === 'granted' ? 1 : num(r.bonus);
  return { lives, companion: r.companion ? toCompanion(r.companion) : null, bonus };
}

export function toShopItems(v: unknown): ShopItem[] {
  const list = Array.isArray(v) ? v : row(v).items;
  return rows(list)
    .map((r) => {
      const priceUsdCents = num(r.price_usd_cents);
      const priceLamports = num(r.price_lamports);
      return {
        key: str(r.key),
        kind: kindOf(r.kind),
        title: str(r.title),
        description: str(r.description),
        priceUsdCents,
        priceLamports,
        priceLabel: priceLabel(orNull(r.price_label), priceUsdCents, priceLamports),
        art: row(r.art),
        owned: r.owned === true,
        equipped: r.equipped === true,
        ownedRefs: Array.isArray(r.owned_refs) ? r.owned_refs.filter((ref): ref is string => typeof ref === 'string') : [],
      };
    })
    .filter((item) => item.key);
}

export function toIntent(v: unknown): PurchaseIntent {
  const r = row(v);
  const intentId = str(r.intent_id);
  if (!intentId) throw new Error('purchase-intent: no intent_id in the answer');
  const priceUsdCents = num(r.price_usd_cents);
  const priceLamports = num(r.price_lamports);
  return {
    intentId,
    messageBase58: str(r.message_base58),
    transactionBase58: str(r.transaction_base58),
    transactionBase64: str(r.transaction_base64),
    priceLamports,
    priceUsdCents,
    priceLabel: priceLabel(orNull(r.price_label), priceUsdCents, priceLamports),
    expiresAt: orNull(r.expires_at),
    cluster: str(r.cluster) || 'devnet',
  };
}

export function toConfirmation(v: unknown): PurchaseConfirmation {
  const r = row(v);
  const status = STATUSES.includes(r.status as PurchaseStatus) ? (r.status as PurchaseStatus) : 'failed';
  return {
    status,
    itemKey: orNull(r.item) ?? orNull(row(r.item).key) ?? orNull(row(r.item).item_key),
    lives: toLives(r.lives),
    companion: r.companion ? toCompanion(r.companion) : null,
    inventory: Array.isArray(r.inventory) ? toInventory(r.inventory) : null,
    explorerUrl: orNull(r.explorer_url),
  };
}

export function toFaucet(v: unknown): FaucetResult {
  const r = row(v);
  const signature = orNull(r.signature);
  return signature ? { signature, blocked: null } : { signature: null, blocked: str(r.blocked) || 'unavailable' };
}
