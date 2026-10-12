import {
  DEFAULT_AVATAR_KEY,
  avatarAssetName,
  avatarAttributes,
  avatarMetadataUrl,
  avatarView,
  fallbackAvatarView,
  includesOf,
  isOwnedRow,
  reserveAvatar,
  resolveAvatar,
  type AvatarAssetRow,
  type AvatarCatalog,
  type AvatarItem,
  type AvatarSupply,
  type AvatarTier,
  type IncludedItem,
  type ReservationStore,
  type ReserveInput,
  type ReserveResult,
} from './avatars.ts';
import type { Lang } from './art.ts';
import { COLLECTIONS } from './chain-names.ts';
import { loadWornBorder } from './borders-store.ts';
import { loadConfig, type IteraClient } from './db.ts';
import { functionsBase } from './http.ts';

export const AVATAR_ITEM_COLUMNS =
  'key,title_i18n,description_i18n,price_lamports,price_usd_cents,price_label,rarity,avatar_group,supply_cap,image_key,effect,price_crystals,active,sort';
export const AVATAR_ASSET_COLUMNS = 'id,user_id,item_key,serial,purchase_id,mint_status,reserved_until,wallet,asset_address,tx_signature,minted_at';
const CATALOG_TTL_MS = 60_000;
const UNIQUE_VIOLATION = '23505';
const STALE_MINT_MS = 3 * 60_000;
const MINT_WAIT_MS = 12_000;
const MINT_POLL_MS = 800;

export function supabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL') ?? '';
}

let cached: { at: number; catalog: AvatarCatalog } | null = null;

/** Every avatar and tier. Kept in memory for a minute: the catalog is read on most requests and changes rarely. */
export async function loadAvatarCatalog(db: IteraClient, fresh = false): Promise<AvatarCatalog> {
  if (!fresh && cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.catalog;
  const [items, tiers] = await Promise.all([
    db.from('shop_items').select(AVATAR_ITEM_COLUMNS).eq('kind', 'avatar').order('sort').order('key'),
    db.from('avatar_tiers').select('rarity,rank,tier_name_i18n,label_i18n,earn_only'),
  ]);
  if (items.error) throw new Error(`shop_items avatars: ${items.error.message}`);
  if (tiers.error) throw new Error(`avatar_tiers: ${tiers.error.message}`);
  const avatars = (items.data ?? []) as unknown as AvatarItem[];
  // What the avatars carry with them: one more read, only for the keys they name.
  const includedKeys = [...new Set(avatars.flatMap((item) => includesOf(item.effect)))];
  const included = new Map<string, IncludedItem>();
  if (includedKeys.length > 0) {
    const { data, error } = await db.from('shop_items').select('key,kind,title_i18n').in('key', includedKeys);
    if (error) throw new Error(`shop_items included: ${error.message}`);
    for (const row of (data ?? []) as unknown as IncludedItem[]) included.set(row.key, row);
  }
  const catalog: AvatarCatalog = {
    items: new Map(avatars.map((item) => [item.key, item])),
    tiers: new Map(((tiers.data ?? []) as AvatarTier[]).map((tier) => [tier.rarity, tier])),
    included,
  };
  cached = { at: Date.now(), catalog };
  return catalog;
}

export async function loadSupply(db: IteraClient): Promise<Map<string, AvatarSupply>> {
  const { data, error } = await db.from('avatar_supply').select('item_key,minted,held');
  if (error) throw new Error(`avatar_supply: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.item_key as string, { minted: Number(row.minted), held: Number(row.held) }]));
}

/** The learner's rows, unpaid holds included (callers decide with `isOwnedRow`). */
export async function loadAvatarRows(db: IteraClient, userId: string): Promise<AvatarAssetRow[]> {
  const { data, error } = await db.from('avatar_assets').select(AVATAR_ASSET_COLUMNS).eq('user_id', userId).order('created_at');
  if (error) throw new Error(`avatar_assets: ${error.message}`);
  return (data ?? []) as AvatarAssetRow[];
}

export async function loadAvatarRow(db: IteraClient, userId: string, itemKey: string): Promise<AvatarAssetRow | null> {
  const { data, error } = await db.from('avatar_assets').select(AVATAR_ASSET_COLUMNS).eq('user_id', userId).eq('item_key', itemKey).maybeSingle();
  if (error) throw new Error(`avatar_assets: ${error.message}`);
  return data as AvatarAssetRow | null;
}

function reservationStore(db: IteraClient): ReservationStore {
  return {
    async dropExpired(itemKey, now) {
      const { error } = await db.from('avatar_assets').delete().eq('item_key', itemKey).eq('mint_status', 'reserved').lte('reserved_until', now.toISOString());
      if (error) throw new Error(`avatar_assets expire: ${error.message}`);
    },
    findOwn: (userId, itemKey) => loadAvatarRow(db, userId, itemKey),
    async takenSerials(itemKey) {
      const { data, error } = await db.from('avatar_assets').select('serial').eq('item_key', itemKey).order('serial').limit(10_000);
      if (error) throw new Error(`avatar_assets serials: ${error.message}`);
      return (data ?? []).map((row) => row.serial as number);
    },
    async openHolds(userId, now) {
      const { data, error } = await db
        .from('avatar_assets')
        .select('id,shop_items!inner(supply_cap)')
        .eq('user_id', userId)
        .eq('mint_status', 'reserved')
        .gt('reserved_until', now.toISOString())
        .not('shop_items.supply_cap', 'is', null);
      if (error) throw new Error(`avatar_assets holds: ${error.message}`);
      return (data ?? []).length;
    },
    async insert(row) {
      const { data, error } = await db.from('avatar_assets').insert(row).select(AVATAR_ASSET_COLUMNS).maybeSingle();
      if (error?.code === UNIQUE_VIOLATION) return null;
      if (error) throw new Error(`avatar_assets insert: ${error.message}`);
      return data as AvatarAssetRow | null;
    },
    async keep(id, patch) {
      const { data, error } = await db.from('avatar_assets').update(patch).eq('id', id).eq('mint_status', 'reserved').select(AVATAR_ASSET_COLUMNS).maybeSingle();
      if (error) throw new Error(`avatar_assets keep: ${error.message}`);
      return data as AvatarAssetRow | null;
    },
  };
}

export function reserve(db: IteraClient, input: ReserveInput): Promise<ReserveResult> {
  return reserveAvatar(reservationStore(db), input);
}

/** Gives back the unpaid hold an intent made (the intent could not be opened after all). */
export async function releaseHold(db: IteraClient, userId: string, itemKey: string): Promise<void> {
  const { error } = await db.from('avatar_assets').delete().eq('user_id', userId).eq('item_key', itemKey).eq('mint_status', 'reserved');
  if (error) throw new Error(`avatar_assets release: ${error.message}`);
}

/** The keys a learner may wear beyond the free ones. */
export async function ownedAvatarKeys(db: IteraClient, userId: string): Promise<Map<string, AvatarAssetRow>> {
  return new Map((await loadAvatarRows(db, userId)).filter((row) => isOwnedRow(row)).map((row) => [row.item_key, row]));
}

/**
 * The `avatar` block for a learner's stored key. Never throws and never empty:
 * a key that left the catalog, or a collectible the learner has no row for,
 * shows the default avatar.
 */
export async function avatarBlock(db: IteraClient, userId: string, storedKey: string | null | undefined, lang: Lang) {
  try {
    const [catalog, border] = await Promise.all([loadAvatarCatalog(db), loadWornBorder(db, userId)]);
    let item = resolveAvatar(catalog, storedKey);
    if (!item) return fallbackAvatarView(supabaseUrl());
    let own: AvatarAssetRow | null = null;
    if (item.price_lamports !== null) {
      own = await loadAvatarRow(db, userId, item.key);
      if (!isOwnedRow(own)) {
        own = null;
        item = resolveAvatar(catalog, DEFAULT_AVATAR_KEY);
        if (!item) return fallbackAvatarView(supabaseUrl());
      }
    }
    return avatarView(catalog, item, lang, supabaseUrl(), own?.asset_address ?? null, border);
  } catch (error) {
    console.error('avatar block failed', error instanceof Error ? error.message : error);
    return fallbackAvatarView(supabaseUrl());
  }
}

async function claimAvatarMint(db: IteraClient, rowId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_MINT_MS).toISOString();
  const { data, error } = await db
    .from('avatar_assets')
    .update({ mint_claimed_at: new Date().toISOString() })
    .eq('id', rowId)
    .in('mint_status', ['pending', 'failed'])
    .or(`mint_claimed_at.is.null,mint_claimed_at.lt."${staleBefore}"`)
    .select('id');
  if (error) throw new Error(`avatar_assets claim: ${error.message}`);
  return (data ?? []).length > 0;
}

async function loadById(db: IteraClient, rowId: string): Promise<AvatarAssetRow | null> {
  const { data, error } = await db.from('avatar_assets').select(AVATAR_ASSET_COLUMNS).eq('id', rowId).maybeSingle();
  if (error) throw new Error(`avatar_assets: ${error.message}`);
  return data as AvatarAssetRow | null;
}

/**
 * Mints the collectible for a PAID row to the buyer's wallet, once. The asset
 * address is derived from the row id, so a retry after a lost response finds the
 * asset instead of minting a second one. One invocation mints at a time; another
 * one waits for it. Throws while the asset is still due.
 */
export async function mintAvatar(db: IteraClient, catalog: AvatarCatalog, item: AvatarItem, row: AvatarAssetRow, wallet: string): Promise<AvatarAssetRow> {
  if (row.mint_status === 'minted' && row.asset_address) return row;
  if (!(await claimAvatarMint(db, row.id))) {
    const deadline = Date.now() + MINT_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, MINT_POLL_MS));
      const current = await loadById(db, row.id);
      if (current?.mint_status === 'minted' && current.asset_address) return current;
    }
    throw new Error('avatar mint is in progress in another call');
  }

  try {
    const sdk = await import('./chain.ts');
    const chain = sdk.loadChain();
    if ((await sdk.authorityLamports(chain)) < sdk.MIN_AUTHORITY_LAMPORTS) throw new Error('authority_unfunded');
    const config = await loadConfig(db);
    const { configKey } = COLLECTIONS.avatars;
    let collection = config[configKey];
    if (!collection) {
      collection = await sdk.ensureCollection(chain, 'avatars', `${functionsBase()}/credential-meta/collection/avatars`);
      const { error } = await db.from('onchain_config').upsert({ key: configKey, value: collection, updated_at: new Date().toISOString() });
      if (error) throw new Error(`onchain_config: ${error.message}`);
    }
    const created = await sdk.createCollectible(chain, {
      rowId: `avatar:${row.id}`,
      collection,
      owner: wallet,
      name: avatarAssetName(catalog, item, row.serial),
      uri: avatarMetadataUrl(functionsBase(), row.id),
      attributes: avatarAttributes(catalog, item, row.serial),
    });
    const { data, error } = await db
      .from('avatar_assets')
      .update({
        mint_status: 'minted',
        asset_address: created.asset,
        tx_signature: created.signature,
        wallet,
        minted_at: new Date().toISOString(),
        mint_error: null,
        mint_claimed_at: null,
      })
      .eq('id', row.id)
      .select(AVATAR_ASSET_COLUMNS)
      .single();
    if (error) throw new Error(`avatar_assets settle: ${error.message}`);
    return data as AvatarAssetRow;
  } catch (failure) {
    const message = String(failure instanceof Error ? failure.message : failure).slice(0, 300);
    await db.from('avatar_assets').update({ mint_status: 'failed', mint_error: message, mint_claimed_at: null }).eq('id', row.id).neq('mint_status', 'minted');
    throw failure;
  }
}
