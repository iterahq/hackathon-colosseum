/** Wire (snake_case, loosely typed) -> app types for the lives / shop / companion functions. One file to fix when a shape moves. */
import { DEFAULT_AVATAR, type AvatarGroup, type AvatarInclude, type AvatarOffer, type AvatarRarity, type AvatarSeason, type LearnerAvatar } from '@/types/avatar';
import type {
  ChainProof,
  CompanionSnapshot,
  CompanionState,
  FaucetResult,
  InventoryEntry,
  ItemBorder,
  LifePack,
  LivesState,
  LivesUpdate,
  PurchaseConfirmation,
  PurchaseIntent,
  PurchaseStatus,
  ShopItem,
  ShopItemKind,
  ShopUnlock,
} from '@/types/shop';
import { DEFAULT_MAX_LIVES, DEFAULT_REGEN_SECONDS } from '@/utils/lives';
import { priceLabel } from '@/utils/shopPrice';
import { toPurchaseCircuit } from '@/services/circuit.service';
import { toGift } from '@/services/gift.service';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const orNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const KINDS: readonly ShopItemKind[] = ['life', 'outfit', 'ink', 'frame', 'avatar', 'border', 'background', 'app_icon'];
const kindOf = (v: unknown): ShopItemKind => (KINDS.includes(v as ShopItemKind) ? (v as ShopItemKind) : 'outfit');
const STATUSES: readonly PurchaseStatus[] = ['paid', 'pending', 'failed', 'expired'];

/** Null when the block is absent or has no usable counter: callers treat that as "no lives backend". */
export function toLives(v: unknown): LivesState | null {
  const r = row(v);
  if (typeof r.current !== 'number') return null;
  const max = Math.max(1, num(r.max, DEFAULT_MAX_LIVES));
  // A gifted life may sit one above the maximum: the backend says so in `bonus`.
  const bonus = Math.min(1, Math.max(0, Math.floor(num(r.bonus))));
  const current = Math.min(max + bonus, Math.max(0, Math.floor(r.current)));
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
    imageUrl: orNull(r.image_url),
  };
}

const RARITIES: readonly AvatarRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic', 'primordial'];
const GROUPS: readonly AvatarGroup[] = ['expression', 'base', 'special', 'event', 'accessory'];
const rarityOf = (v: unknown): AvatarRarity => (RARITIES.includes(v as AvatarRarity) ? (v as AvatarRarity) : 'common');

/** `chip_url` when sent; else the published pattern `<key>.webp` -> `<key>_chip.webp`; else the full image. */
const chipOf = (r: Row, imageUrl: string): string =>
  str(r.chip_url) || (/\/[a-z0-9_]+\.webp$/.test(imageUrl) ? imageUrl.replace(/\.webp$/, '_chip.webp') : imageUrl);

/** The backend says it; without the field only the expression icons (and the default) take an outfit. */
const allowsOutfit = (r: Row): boolean =>
  typeof r.allows_outfit === 'boolean' ? r.allows_outfit : r.group === 'expression' || str(r.key).startsWith('tera_');

/** The default avatar when the block is absent or has no image: every learner always has a face. */
export function toAvatar(v: unknown): LearnerAvatar {
  const r = row(v);
  const imageUrl = str(r.image_url);
  if (!str(r.key) || !imageUrl) return DEFAULT_AVATAR;
  return {
    key: str(r.key),
    title: str(r.title) || DEFAULT_AVATAR.title,
    rarity: rarityOf(r.rarity),
    tierName: str(r.tier_name) || DEFAULT_AVATAR.tierName,
    imageUrl,
    thumbUrl: str(r.thumb_url) || imageUrl,
    chipUrl: chipOf(r, imageUrl),
    assetAddress: orNull(r.asset_address),
    allowsOutfit: allowsOutfit(r),
  };
}

export function toSeason(v: unknown): AvatarSeason | null {
  const r = row(v);
  const key = str(r.key);
  if (!key) return null;
  return { key, label: str(r.label) || key, startsAt: orNull(r.starts_at), endsAt: orNull(r.ends_at), available: r.available !== false };
}

export function toIncludes(v: unknown): AvatarInclude[] {
  return rows(v)
    .map((r) => ({ key: str(r.key), kind: str(r.kind), title: str(r.title) }))
    .filter((i) => i.key && i.title);
}

/** `effect` of a life pack; null for anything else. */
export function toLifePack(v: unknown): LifePack | null {
  const r = row(v);
  const addLives = typeof r.add_lives === 'number' && r.add_lives > 0 ? r.add_lives : null;
  const unlimitedDays = typeof r.unlimited_days === 'number' && r.unlimited_days > 0 ? r.unlimited_days : null;
  return addLives || unlimitedDays ? { addLives, unlimitedDays } : null;
}

export function toItemBorder(v: unknown): ItemBorder | null {
  const r = row(v);
  if (typeof r.style !== 'string') return null;
  const colors = Array.isArray(r.colors) ? r.colors.filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c)) : [];
  return { style: r.style, colors, glow: r.glow === true, animated: r.animated === true };
}

const crystalsOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

function toAvatarOffer(r: Row): AvatarOffer | null {
  const imageUrl = str(r.image_url);
  if (!imageUrl) return null;
  const supply = row(r.supply);
  return {
    rarity: rarityOf(r.rarity),
    rarityLabel: str(r.rarity_label),
    tierName: str(r.tier_name),
    group: GROUPS.includes(r.group as AvatarGroup) ? (r.group as AvatarGroup) : 'base',
    free: r.free === true,
    imageUrl,
    thumbUrl: str(r.thumb_url) || imageUrl,
    chipUrl: chipOf(r, imageUrl),
    supply: { minted: num(supply.minted), max: typeof supply.max === 'number' ? supply.max : null },
    assetAddress: orNull(r.asset_address),
    allowsOutfit: allowsOutfit(r),
    season: toSeason(r.season),
    includes: toIncludes(r.includes),
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
  return { lives, companion: toCompanion(r.companion), avatar: toAvatar(r.avatar), inventory: toInventory(r.inventory), wallet: walletOfWire(r.wallet), mocked };
}

export function toChain(v: unknown): ChainProof | null {
  const r = row(v);
  const explorerUrl = str(r.explorer_url);
  if (!explorerUrl) return null;
  return { explorerUrl, signature: str(r.tx_signature) || null, lives: typeof r.lives === 'number' ? r.lives : null };
}

export function toLivesUpdate(v: unknown): LivesUpdate {
  const r = row(v);
  const lives = toLives(r.lives);
  if (!lives) throw new Error('lives: no lives block in the answer');
  // `bonus` is a verdict (`granted | already_granted | mistakes | lesson_incomplete | full`): only `granted` adds a life.
  const bonus = r.bonus === 'granted' ? 1 : num(r.bonus);
  return { lives, companion: r.companion ? toCompanion(r.companion) : null, bonus, chain: toChain(r.chain) };
}

export function toUnlock(v: unknown): ShopUnlock | null {
  const r = row(v);
  if (typeof r.level !== 'number') return null;
  return { level: r.level, currentLevel: typeof r.current_level === 'number' ? r.current_level : null, unlocked: r.unlocked === true };
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
        priceCrystals: crystalsOf(r.price_crystals),
        solEnabled: r.sol_enabled !== false,
        crystalsEnabled: r.crystals_enabled !== false,
        forSale: r.for_sale !== false,
        includedWith: orNull(r.included_with),
        color: typeof r.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(r.color) ? r.color : null,
        border: toItemBorder(r.border),
        lifePack: r.kind === 'life' ? toLifePack(r.effect) : null,
        art: row(r.art),
        owned: r.owned === true,
        equipped: r.equipped === true,
        ownedRefs: Array.isArray(r.owned_refs) ? r.owned_refs.filter((ref): ref is string => typeof ref === 'string') : [],
        unlock: toUnlock(r.unlock),
        avatar: r.kind === 'avatar' ? toAvatarOffer(r) : null,
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
    messageBase64: str(r.message_base64),
    transactionBase58: str(r.transaction_base58),
    transactionBase64: str(r.transaction_base64),
    priceLamports,
    priceUsdCents,
    priceLabel: priceLabel(orNull(r.price_label), priceUsdCents, priceLamports),
    expiresAt: orNull(r.expires_at),
    cluster: str(r.cluster) || 'devnet',
    payer: orNull(r.payer),
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
    imageUrl: orNull(r.image_url) ?? orNull(row(r.companion).image_url),
    written: rows(r.written).map((w) => ({ asset: str(w.asset), attribute: str(w.attribute), value: String(w.value ?? '') })).filter((w) => w.attribute),
    chain: toChain(r.chain),
    gift: toGift(r.gift),
    circuit: toPurchaseCircuit(r.circuit),
  };
}

export function toFaucet(v: unknown): FaucetResult {
  const r = row(v);
  const signature = orNull(r.signature);
  return signature ? { signature, blocked: null } : { signature: null, blocked: str(r.blocked) || 'unavailable' };
}
