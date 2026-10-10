import { COLLECTIONS } from './chain-names.ts';
import {
  COMPANION_ASSET_NAME,
  companionAttributes,
  companionImageUrl,
  companionMetadataUrl,
  sameAttributes,
  type CompanionSnapshot,
} from './companion.ts';
import { cosmeticsOf } from './cosmetics.ts';
import { restoreCosmetics } from './cosmetics-store.ts';
import { changedAttributes, explorerUrl, type ChainWrite, type OnchainAttribute } from './credential.ts';
import { loadConfig, type IteraClient } from './db.ts';
import { functionsBase } from './http.ts';
import { deriveStats, livesView, regenerate, type CompanionStats, type LivesState, type XpEvent } from './lives.ts';

export const TIME_ZONE = 'America/Sao_Paulo';
const STALE_CLAIM_MS = 3 * 60_000;
const CAS_ATTEMPTS = 5;
const XP_PAGE = 1000;
const COLUMNS =
  'user_id,id,lives,max_lives,last_regen_at,outfit,wallet_address,asset_address,mint_status,mint_claimed_at,tx_signature,minted_at,mirrored,mirrored_at,mirror_due,version';

export interface CompanionRow {
  user_id: string;
  id: string;
  lives: number;
  max_lives: number;
  last_regen_at: string;
  outfit: string | null;
  wallet_address: string | null;
  asset_address: string | null;
  mint_status: 'unclaimed' | 'pending' | 'minted' | 'failed';
  mint_claimed_at: string | null;
  tx_signature: string | null;
  minted_at: string | null;
  mirrored: OnchainAttribute[] | null;
  mirrored_at: string | null;
  mirror_due: boolean;
  version: number;
}

const livesOf = (row: CompanionRow): LivesState => ({ lives: row.lives, maxLives: row.max_lives, lastRegenAt: row.last_regen_at });

async function loadCompanion(db: IteraClient, userId: string): Promise<CompanionRow | null> {
  const { data, error } = await db.from('companions').select(COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`companions: ${error.message}`);
  return data as CompanionRow | null;
}

/** The learner's companion row, created with full lives on first use. */
export async function ensureCompanion(db: IteraClient, userId: string): Promise<CompanionRow> {
  const existing = await loadCompanion(db, userId);
  if (existing) return existing;
  const { error } = await db.from('companions').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (error) throw new Error(`companions insert: ${error.message}`);
  const created = await loadCompanion(db, userId);
  if (!created) throw new Error('companions: row missing after insert');
  return created;
}

/** Applies a lives change with compare-and-swap on `version`, so concurrent requests never lose one. */
export async function changeLives(
  db: IteraClient,
  userId: string,
  change: (state: LivesState, now: Date) => LivesState,
): Promise<CompanionRow> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const row = await ensureCompanion(db, userId);
    const now = new Date();
    const next = change(livesOf(row), now);
    const { data, error } = await db
      .from('companions')
      .update({ lives: next.lives, last_regen_at: next.lastRegenAt, version: row.version + 1, updated_at: now.toISOString() })
      .eq('user_id', userId)
      .eq('version', row.version)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`companions update: ${error.message}`);
    if (data) return data as CompanionRow;
  }
  throw new Error('companions: too many concurrent updates');
}

export async function setOutfit(db: IteraClient, userId: string, outfit: string | null): Promise<CompanionRow> {
  const { data, error } = await db
    .from('companions')
    .update({ outfit, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`companions outfit: ${error.message}`);
  return data as CompanionRow;
}

export async function loadStats(db: IteraClient, userId: string, now: Date): Promise<CompanionStats> {
  const events: XpEvent[] = [];
  for (let from = 0; ; from += XP_PAGE) {
    const { data, error } = await db
      .from('xp_events')
      .select('amount,created_at')
      .eq('user_id', userId)
      .order('created_at')
      .order('id')
      .range(from, from + XP_PAGE - 1);
    if (error) throw new Error(`xp_events: ${error.message}`);
    events.push(...((data ?? []) as XpEvent[]));
    if (!data || data.length < XP_PAGE) break;
  }
  return deriveStats(events, now, TIME_ZONE);
}

/** The public snapshot behind a companion id or asset address. `null` when there is none. */
export async function loadCompanionSnapshot(db: IteraClient, id: string, by: 'id' | 'asset_address' = 'id'): Promise<CompanionSnapshot | null> {
  const { data, error } = await db.from('companions').select(COLUMNS).eq(by, id).maybeSingle();
  if (error) throw new Error(`companions: ${error.message}`);
  if (!data) return null;
  const row = data as CompanionRow;
  const now = new Date();
  return snapshotOf(row, await loadStats(db, row.user_id, now), now);
}

export function snapshotOf(row: CompanionRow, stats: CompanionStats, now: Date): CompanionSnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    lives: regenerate(livesOf(row), now).lives,
    maxLives: row.max_lives,
    outfit: row.outfit,
    stats,
    assetAddress: row.asset_address,
    mirrored: row.mirrored,
    mirroredAt: row.mirrored_at,
  };
}

/** The `lives` and `companion` blocks every companion-facing response carries. */
export function companionResponse(row: CompanionRow, stats: CompanionStats, now: Date) {
  const base = functionsBase();
  return {
    lives: livesView(livesOf(row), now),
    companion: {
      id: row.id,
      asset_address: row.asset_address,
      mint_status: row.mint_status,
      explorer_url: explorerUrl('address', row.asset_address),
      outfit: row.outfit,
      level: stats.level,
      xp: stats.xp,
      streak: stats.streak,
      metadata_url: companionMetadataUrl(base, row.id),
      image_url: `${companionImageUrl(base, row.id)}?v=${row.version}-${row.outfit ?? 'none'}`,
    },
  };
}

export interface InventoryEntry {
  item_key: string;
  kind: string;
  ref_id: string;
  qty: number;
  equipped: boolean;
}

/** What the learner owns. `equipped`: the outfit Tera wears, or a cosmetic its passport shows. */
export async function loadInventory(db: IteraClient, userId: string, outfit: string | null): Promise<InventoryEntry[]> {
  const { data, error } = await db
    .from('user_inventory')
    .select('item_key,ref_id,qty,shop_items(kind,effect)')
    .eq('user_id', userId)
    .gt('qty', 0)
    .order('item_key');
  if (error) throw new Error(`user_inventory: ${error.message}`);
  const rows = (data ?? []) as unknown as Array<{
    item_key: string;
    ref_id: string;
    qty: number;
    shop_items: { kind: string; effect: Record<string, unknown> } | null;
  }>;

  const cosmeticsByTrail = new Map<string, ReturnType<typeof cosmeticsOf>>();
  if (rows.some((row) => row.shop_items?.kind === 'ink' || row.shop_items?.kind === 'frame')) {
    const { data: passports, error: passportError } = await db
      .from('user_achievements')
      .select('ref_id,state')
      .eq('user_id', userId)
      .eq('achievement_key', 'trail_pass');
    if (passportError) throw new Error(`user_achievements: ${passportError.message}`);
    const worn = await restoreCosmetics(
      db,
      (passports ?? []).map((passport) => ({ user_id: userId, achievement_key: 'trail_pass', ref_id: passport.ref_id, state: passport.state })),
    );
    for (const passport of worn) cosmeticsByTrail.set(passport.ref_id, cosmeticsOf(passport.state));
  }

  return rows.map((row) => {
    const kind = row.shop_items?.kind ?? '';
    const worn = cosmeticsByTrail.get(row.ref_id);
    const value = row.shop_items?.effect?.value;
    const equipped =
      kind === 'outfit' ? row.item_key === outfit : kind === 'ink' ? worn?.ink === value : kind === 'frame' ? worn?.frame === value : false;
    return { item_key: row.item_key, kind, ref_id: row.ref_id, qty: row.qty, equipped };
  });
}

/** Work that may finish after the response is sent. Awaited in place where the runtime has no such hook. */
export function inBackground(work: Promise<unknown>): void {
  const guarded = work.catch((error) => console.error('background work failed', error));
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  runtime?.waitUntil?.(guarded);
}

/** Takes the mint for this invocation. False when it is minted already or another call holds it. */
export async function claimMint(db: IteraClient, userId: string, wallet: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data, error } = await db
    .from('companions')
    .update({ mint_status: 'pending', mint_claimed_at: new Date().toISOString(), wallet_address: wallet })
    .eq('user_id', userId)
    .or(`mint_status.in.(unclaimed,failed),and(mint_status.eq.pending,mint_claimed_at.lt."${staleBefore}")`)
    .select('user_id');
  if (error) throw new Error(`companions claim: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * Mints the soulbound companion to the learner's wallet. Call only after
 * `claimMint`. The asset address is derived from the user id, so a retry finds
 * the asset instead of minting a second one. Never throws: a failure is recorded.
 */
export async function mintCompanion(db: IteraClient, userId: string, wallet: string): Promise<void> {
  try {
    const sdk = await import('./chain.ts');
    const chain = sdk.loadChain();
    if ((await sdk.authorityLamports(chain)) < sdk.MIN_AUTHORITY_LAMPORTS) throw new Error('authority_unfunded');

    const config = await loadConfig(db);
    const { configKey } = COLLECTIONS.companions;
    let collection = config[configKey];
    if (!collection) {
      collection = await sdk.ensureCollection(chain, 'companions', `${functionsBase()}/credential-meta/collection/companions`);
      const { error } = await db.from('onchain_config').upsert({ key: configKey, value: collection, updated_at: new Date().toISOString() });
      if (error) throw new Error(`onchain_config: ${error.message}`);
    }

    const now = new Date();
    const row = await ensureCompanion(db, userId);
    const attributes = companionAttributes(snapshotOf(row, await loadStats(db, userId, now), now));
    const created = await sdk.createCredential(chain, {
      rowId: `companion:${userId}`,
      collection,
      owner: wallet,
      name: COMPANION_ASSET_NAME,
      uri: companionMetadataUrl(functionsBase(), row.id),
      attributes,
    });
    const signature = created.alreadyExisted
      ? await sdk.updateCredentialAttributes(chain, { asset: created.asset, collection, attributes })
      : created.signature;
    const { error } = await db
      .from('companions')
      .update({
        mint_status: 'minted',
        asset_address: created.asset,
        tx_signature: signature,
        minted_at: now.toISOString(),
        mint_error: null,
        mirrored: attributes,
        mirrored_at: new Date().toISOString(),
        mirror_due: false,
      })
      .eq('user_id', userId);
    if (error) throw new Error(`companions settle: ${error.message}`);
  } catch (error) {
    console.error(`companion mint for ${userId} failed`, error);
    const message = String(error instanceof Error ? error.message : error).slice(0, 300);
    await db.from('companions').update({ mint_status: 'failed', mint_error: message }).eq('user_id', userId);
  }
}

export interface MirrorResult {
  /** Chain and database agree after this call. */
  synced: boolean;
  /** The transaction this call sent; `null` when there was nothing to write or it failed. */
  write: ChainWrite | null;
}

/**
 * Writes the companion's current attributes to its asset when they differ from
 * the last ones written. Never throws: a failed write is flagged `mirror_due`
 * and retried by the next call.
 */
export async function syncMirror(db: IteraClient, userId: string): Promise<MirrorResult> {
  try {
    const row = await loadCompanion(db, userId);
    if (!row || row.mint_status !== 'minted' || !row.asset_address) return { synced: false, write: null };
    const now = new Date();
    const attributes = companionAttributes(snapshotOf(row, await loadStats(db, userId, now), now));
    let write: ChainWrite | null = null;
    if (!sameAttributes(row.mirrored, attributes)) {
      const [sdk, config] = await Promise.all([import('./chain.ts'), loadConfig(db)]);
      const collection = config[COLLECTIONS.companions.configKey];
      if (!collection) throw new Error('companions collection is not configured');
      const signature = await sdk.updateCredentialAttributes(sdk.loadChain(), { asset: row.asset_address, collection, attributes });
      write = {
        asset: row.asset_address,
        signature,
        at: new Date().toISOString(),
        attributes,
        changed: changedAttributes(row.mirrored, attributes),
      };
    } else if (!row.mirror_due) {
      return { synced: true, write: null };
    }
    const { error } = await db
      .from('companions')
      .update({ mirrored: attributes, mirror_due: false, mirror_error: null, ...(write ? { mirrored_at: write.at } : {}) })
      .eq('user_id', userId);
    if (error) throw new Error(`companions mirror: ${error.message}`);
    return { synced: true, write };
  } catch (error) {
    console.error('companion mirror failed', error);
    const message = String(error instanceof Error ? error.message : error).slice(0, 300);
    await db.from('companions').update({ mirror_due: true, mirror_error: message }).eq('user_id', userId);
    return { synced: false, write: null };
  }
}

/**
 * The mirror with a time budget, for a request that should carry the proof but
 * must not wait for a slow chain. Past the budget the write keeps going in the
 * background, the row is flagged `mirror_due` and the answer is `null`.
 */
export async function mirrorWithin(db: IteraClient, userId: string, budgetMs: number): Promise<ChainWrite | null> {
  const work = syncMirror(db, userId);
  inBackground(work);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs);
  });
  const result = await Promise.race([work, late]);
  clearTimeout(timer);
  if (result === null) {
    await db.from('companions').update({ mirror_due: true }).eq('user_id', userId);
    return null;
  }
  return result.write;
}
