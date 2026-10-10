import type { Lang } from './art.ts';
import { APP_URL, pickText, type OnchainAttribute } from './credential.ts';

/** The avatar every learner wears until they pick another one. Never minted, never sold. */
export const DEFAULT_AVATAR_KEY = 'tera_normal';
export const AVATAR_BUCKET = 'tera-avatars';
/** The only avatars an outfit is drawn over: the others are finished paintings. */
export const OUTFIT_GROUP = 'expression';
/** How long past the intent's own expiry an unpaid hold keeps its serial. */
export const RESERVATION_GRACE_MS = 2 * 60_000;
/** Unpaid holds of LIMITED avatars one learner may have open at a time. */
export const MAX_OPEN_RESERVATIONS = 2;
const RESERVE_ATTEMPTS = 6;

type I18n = Record<string, string>;

/** A `shop_items` row of kind `avatar`. */
export interface AvatarItem {
  key: string;
  title_i18n: I18n;
  description_i18n: I18n;
  /** `null`: a free avatar. */
  price_lamports: number | null;
  price_usd_cents: number;
  price_label: string;
  rarity: string;
  avatar_group: string;
  supply_cap: number | null;
  image_key: string | null;
  active: boolean;
  sort: number;
}

/** A row of `itera.avatar_tiers`. */
export interface AvatarTier {
  rarity: string;
  rank: number;
  tier_name_i18n: I18n;
  label_i18n: I18n;
}

export interface AvatarAssetRow {
  id: string;
  user_id: string;
  item_key: string;
  serial: number;
  purchase_id: string | null;
  mint_status: 'reserved' | 'pending' | 'minted' | 'failed';
  reserved_until: string | null;
  wallet: string | null;
  asset_address: string | null;
  tx_signature: string | null;
  minted_at: string | null;
}

export interface AvatarCatalog {
  items: Map<string, AvatarItem>;
  tiers: Map<string, AvatarTier>;
}

export function isAvatarKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9_]{1,64}$/.test(value);
}

export function isFreeAvatar(item: Pick<AvatarItem, 'price_lamports'>): boolean {
  return item.price_lamports === null || item.price_lamports === undefined;
}

/** A row that is the learner's for good: paid for, whether or not the asset is minted yet. */
export function isOwnedRow(row: Pick<AvatarAssetRow, 'mint_status'> | null | undefined): boolean {
  return Boolean(row) && row?.mint_status !== 'reserved';
}

/** Outfits are painted over the plain Tera faces only. */
export function allowsOutfit(group: string | null | undefined): boolean {
  return group === OUTFIT_GROUP;
}

export function avatarImageUrl(supabaseUrl: string, item: Pick<AvatarItem, 'key' | 'image_key'>, variant: '512' | '128' | 'png' = '512'): string {
  // Only a plain key ever becomes part of a URL, whatever the catalog row holds.
  const key = isAvatarKey(item.image_key) ? item.image_key : item.key;
  const file = variant === '128' ? `${key}_128.webp` : variant === 'png' ? `${key}.png` : `${key}.webp`;
  return `${supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${file}`;
}

export function tierName(catalog: AvatarCatalog, item: Pick<AvatarItem, 'rarity'>, lang: Lang): string {
  return pickText(catalog.tiers.get(item.rarity)?.tier_name_i18n, lang) || 'Tera';
}

export function rarityLabel(catalog: AvatarCatalog, item: Pick<AvatarItem, 'rarity'>, lang: Lang): string {
  return pickText(catalog.tiers.get(item.rarity)?.label_i18n, lang) || item.rarity;
}

/** The avatar to show for a stored key: itself when it is still in the catalog, else the default, else nothing. */
export function resolveAvatar(catalog: AvatarCatalog, key: string | null | undefined): AvatarItem | null {
  const wanted = key ? catalog.items.get(key) : undefined;
  if (wanted && wanted.active) return wanted;
  return catalog.items.get(DEFAULT_AVATAR_KEY) ?? null;
}

export type EquipVerdict = { ok: true } | { ok: false; error: 'unknown_avatar' | 'not_owned' };

/** A free avatar is everyone's; a collectible needs the learner's own paid row. */
export function equipVerdict(item: AvatarItem | undefined, ownedKeys: ReadonlySet<string>): EquipVerdict {
  if (!item || !item.active) return { ok: false, error: 'unknown_avatar' };
  if (isFreeAvatar(item) || ownedKeys.has(item.key)) return { ok: true };
  return { ok: false, error: 'not_owned' };
}

/** The `avatar` block of `companion`, `learner-profile` and the purchase answers. */
export function avatarView(catalog: AvatarCatalog, item: AvatarItem, lang: Lang, supabaseUrl: string, assetAddress: string | null) {
  return {
    key: item.key,
    title: pickText(item.title_i18n, lang),
    rarity: item.rarity,
    tier_name: tierName(catalog, item, lang),
    group: item.avatar_group,
    image_url: avatarImageUrl(supabaseUrl, item),
    thumb_url: avatarImageUrl(supabaseUrl, item, '128'),
    asset_address: assetAddress,
    allows_outfit: allowsOutfit(item.avatar_group),
  };
}

/** The block when the catalog cannot be read at all: the frontend still gets a face. */
export function fallbackAvatarView(supabaseUrl: string) {
  const item = { key: DEFAULT_AVATAR_KEY, image_key: null };
  return {
    key: DEFAULT_AVATAR_KEY,
    title: 'Normal',
    rarity: 'common',
    tier_name: 'Tera',
    group: OUTFIT_GROUP,
    image_url: avatarImageUrl(supabaseUrl, item),
    thumb_url: avatarImageUrl(supabaseUrl, item, '128'),
    asset_address: null,
    allows_outfit: true,
  };
}

export interface AvatarSupply {
  /** Units paid for. */
  minted: number;
  /** Paid units plus unpaid holds still inside their window. */
  held: number;
}

export function isSoldOut(item: Pick<AvatarItem, 'supply_cap'>, supply: AvatarSupply | undefined): boolean {
  return item.supply_cap !== null && (supply?.held ?? 0) >= item.supply_cap;
}

/** What `shop-items` says about an avatar on top of the common fields. */
export function shopAvatarFields(
  catalog: AvatarCatalog,
  item: AvatarItem,
  lang: Lang,
  supabaseUrl: string,
  facts: { supply: AvatarSupply | undefined; own: AvatarAssetRow | null; equippedKey: string | null },
) {
  const free = isFreeAvatar(item);
  const owned = free || isOwnedRow(facts.own);
  // A learner inside their own unpaid hold is not told "sold out": the unit is theirs to pay for.
  const holding = facts.own?.mint_status === 'reserved' && facts.own.reserved_until !== null && Date.parse(facts.own.reserved_until) > Date.now();
  return {
    key: item.key,
    kind: 'avatar',
    title: pickText(item.title_i18n, lang),
    description: pickText(item.description_i18n, lang),
    rarity: item.rarity,
    rarity_label: rarityLabel(catalog, item, lang),
    tier_name: tierName(catalog, item, lang),
    group: item.avatar_group,
    free,
    price_usd_cents: free ? 0 : item.price_usd_cents,
    price_lamports: free ? 0 : (item.price_lamports as number),
    price_label: free ? (lang === 'pt' ? 'Grátis' : 'Free') : item.price_label,
    image_url: avatarImageUrl(supabaseUrl, item),
    thumb_url: avatarImageUrl(supabaseUrl, item, '128'),
    supply: { minted: free ? 0 : (facts.supply?.minted ?? 0), max: item.supply_cap },
    sold_out: !free && !owned && !holding && isSoldOut(item, facts.supply),
    owned,
    equipped: facts.equippedKey === item.key,
    asset_address: facts.own?.asset_address ?? null,
    allows_outfit: allowsOutfit(item.avatar_group),
    sort: item.sort,
  };
}

/** The asset name: `<tier> · <title> #<serial>`, e.g. `Super Tera · Líder #7`. Stable for the life of the asset. */
export function avatarAssetName(catalog: AvatarCatalog, item: AvatarItem, serial: number): string {
  return `${tierName(catalog, item, 'pt')} · ${pickText(item.title_i18n, 'pt')} #${serial}`;
}

export function avatarAttributes(catalog: AvatarCatalog, item: AvatarItem, serial: number): OnchainAttribute[] {
  return [
    { key: 'kind', value: 'avatar' },
    { key: 'key', value: item.key },
    { key: 'rarity', value: item.rarity },
    { key: 'tier', value: tierName(catalog, item, 'en') },
    { key: 'serial', value: String(serial) },
    { key: 'supply_cap', value: item.supply_cap === null ? 'open' : String(item.supply_cap) },
  ];
}

export interface AvatarChainValues {
  key: string;
  rarity: string;
  tier_name: string;
  serial: number;
  supply_cap: number | null;
}

/** An avatar as its asset's attributes say it. `null` when the asset does not say it is one. */
export function avatarFromAttributes(attributes: OnchainAttribute[]): AvatarChainValues | null {
  const values = new Map(attributes.map(({ key, value }) => [key, value]));
  const key = values.get('key');
  if (values.get('kind') !== 'avatar' || !isAvatarKey(key)) return null;
  const integer = (text: string | undefined) => {
    const parsed = Number.parseInt(text ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };
  return {
    key,
    rarity: values.get('rarity') ?? '',
    tier_name: values.get('tier') ?? '',
    serial: integer(values.get('serial')) ?? 0,
    supply_cap: integer(values.get('supply_cap')),
  };
}

export function avatarMetadataUrl(functionsBase: string, assetRowId: string): string {
  return `${functionsBase}/credential-meta/avatar/${assetRowId}`;
}

const META_TEXT = {
  pt: 'Avatar colecionável do Tera, o mascote da Itera. Diferente das certificações, este NFT NÃO é intransferível: é seu para usar como foto de perfil, guardar ou transferir.',
  en: 'A collectible avatar of Tera, the Itera mascot. Unlike the certifications, this NFT is NOT soulbound: it is yours to wear as a profile picture, keep or transfer.',
} as const;

/** Metaplex-standard JSON of a minted avatar. Carries the catalog entry and the serial: no personal data. */
export function avatarMetadata(catalog: AvatarCatalog, item: AvatarItem, row: Pick<AvatarAssetRow, 'serial' | 'asset_address'>, lang: Lang, supabaseUrl: string) {
  const image = avatarImageUrl(supabaseUrl, item);
  return {
    name: `${tierName(catalog, item, lang)} · ${pickText(item.title_i18n, lang)} #${row.serial}`,
    symbol: 'ITERA',
    description: META_TEXT[lang],
    image,
    external_url: row.asset_address ? `${APP_URL}/c/${row.asset_address}` : APP_URL,
    attributes: [
      { trait_type: 'Kind', value: 'avatar' },
      { trait_type: 'Avatar', value: item.key },
      { trait_type: 'Group', value: item.avatar_group },
      { trait_type: 'Rarity', value: item.rarity },
      { trait_type: 'Tier', value: tierName(catalog, item, lang) },
      { trait_type: 'Serial', value: row.serial },
      { trait_type: 'Supply', value: item.supply_cap === null ? 'open' : item.supply_cap },
      { trait_type: 'Transferable', value: 'yes' },
    ],
    properties: {
      category: 'image',
      files: [
        { uri: image, type: 'image/webp' },
        { uri: avatarImageUrl(supabaseUrl, item, 'png'), type: 'image/png' },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Serial reservation. The decisions live here; the store is the database (or a
// fake in the tests). `insert` must be backed by the two unique indexes of
// `itera.avatar_assets`: (item_key, serial) and (user_id, item_key).
// ---------------------------------------------------------------------------

export interface ReservationStore {
  /** Deletes the unpaid holds of this avatar whose window has ended. */
  dropExpired(itemKey: string, now: Date): Promise<void>;
  findOwn(userId: string, itemKey: string): Promise<AvatarAssetRow | null>;
  /** Every serial in use for this avatar (paid or held). */
  takenSerials(itemKey: string): Promise<number[]>;
  /** The learner's live unpaid holds of limited avatars. */
  openHolds(userId: string, now: Date): Promise<number>;
  /** `null` when a unique index refused the row (somebody took the serial, or the learner already has a row). */
  insert(row: { user_id: string; item_key: string; serial: number; purchase_id: string; mint_status: 'reserved' | 'pending'; reserved_until: string | null }): Promise<AvatarAssetRow | null>;
  /** Moves the learner's unpaid hold forward (or makes it permanent). `null` when it is gone. */
  keep(id: string, patch: { purchase_id: string; mint_status: 'reserved' | 'pending'; reserved_until: string | null }): Promise<AvatarAssetRow | null>;
}

export interface ReserveInput {
  userId: string;
  item: Pick<AvatarItem, 'key' | 'supply_cap' | 'price_lamports'>;
  purchaseId: string;
  /** `false`: an unpaid hold until `until`. `true`: the payment settled, the unit is the learner's. */
  paid: boolean;
  until: Date;
  now: Date;
}

export type ReserveResult =
  | { status: 'reserved'; row: AvatarAssetRow }
  | { status: 'owned'; row: AvatarAssetRow }
  | { status: 'sold_out' | 'reservation_limit' | 'free_item' };

/** The lowest serial not in use, or `null` when the cap leaves none. A returned hold is handed out again. */
export function lowestFreeSerial(taken: readonly number[], cap: number | null): number | null {
  const used = new Set(taken);
  for (let serial = 1; cap === null || serial <= cap; serial += 1) {
    if (!used.has(serial)) return serial;
  }
  return null;
}

/**
 * Takes, keeps or confirms the learner's unit of an avatar. Race-safe without a
 * lock: the serial is proposed here and the unique index decides. The loser of
 * a race reads again; when the cap leaves no serial the answer is `sold_out`,
 * so a cap of 5 never holds a sixth row.
 */
export async function reserveAvatar(store: ReservationStore, input: ReserveInput): Promise<ReserveResult> {
  const { userId, item, purchaseId, paid, now } = input;
  if (isFreeAvatar(item)) return { status: 'free_item' };
  const patch = { purchase_id: purchaseId, mint_status: paid ? ('pending' as const) : ('reserved' as const), reserved_until: paid ? null : input.until.toISOString() };

  for (let attempt = 0; attempt < RESERVE_ATTEMPTS; attempt += 1) {
    const own = await store.findOwn(userId, item.key);
    if (own && own.mint_status !== 'reserved') return { status: 'owned', row: own };
    if (own) {
      // The learner's own hold, expired or not, is theirs to keep while nobody else was given the serial.
      const kept = await store.keep(own.id, patch);
      if (kept) return { status: 'reserved', row: kept };
      continue;
    }

    await store.dropExpired(item.key, now);
    const serial = lowestFreeSerial(await store.takenSerials(item.key), item.supply_cap);
    if (serial === null) return { status: 'sold_out' };
    if (!paid && item.supply_cap !== null && (await store.openHolds(userId, now)) >= MAX_OPEN_RESERVATIONS) return { status: 'reservation_limit' };
    const created = await store.insert({ user_id: userId, item_key: item.key, serial, ...patch });
    if (created) return { status: 'reserved', row: created };
  }
  // Every attempt lost its serial to somebody else. A limited avatar under that much demand is gone
  // for this caller; an open edition has no such answer, so the caller is told to ask again.
  if (item.supply_cap !== null) return { status: 'sold_out' };
  throw new Error(`avatar_assets: could not take a serial of ${item.key}`);
}

/** When an unpaid hold made for an intent ends. */
export function reservationUntil(intentExpiresAt: string): Date {
  return new Date(Date.parse(intentExpiresAt) + RESERVATION_GRACE_MS);
}
