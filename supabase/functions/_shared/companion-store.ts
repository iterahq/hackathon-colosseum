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
import { MIRROR_STALE_MS, afterPass, waitDecision } from './mirror.ts';

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
  /** The last write this call confirmed; `null` when it wrote nothing. Its attributes are what the asset holds. */
  write: ChainWrite | null;
  /** Another invocation holds the mirror and was told to write again; this call sent nothing. */
  deferred: boolean;
}

const MIRROR_RETRY_MS = 400;

/** Takes the mirror for this invocation. The token is the claim; `null` when another invocation holds it. */
async function claimMirror(db: IteraClient, userId: string): Promise<string | null> {
  const now = new Date();
  const token = now.toISOString();
  const staleBefore = new Date(now.getTime() - MIRROR_STALE_MS).toISOString();
  const { data, error } = await db
    .from('companions')
    .update({ mirror_claimed_at: token, mirror_dirty: false })
    .eq('user_id', userId)
    .or(`mirror_claimed_at.is.null,mirror_claimed_at.lt."${staleBefore}"`)
    .select('user_id');
  if (error) throw new Error(`companions mirror claim: ${error.message}`);
  return (data ?? []).length > 0 ? token : null;
}

/** The claim, waited for up to `waitMs`. Giving up marks the row dirty so the holder writes again. */
async function claimOrDefer(db: IteraClient, userId: string, waitMs: number): Promise<string | null> {
  const startedAt = Date.now();
  for (;;) {
    const token = await claimMirror(db, userId);
    if (token) return token;
    if (waitDecision(startedAt, Date.now(), waitMs) === 'defer') break;
    await new Promise((resolve) => setTimeout(resolve, MIRROR_RETRY_MS));
  }
  const { error } = await db.from('companions').update({ mirror_dirty: true, mirror_due: true }).eq('user_id', userId);
  if (error) throw new Error(`companions mirror defer: ${error.message}`);
  // The holder may have let go between the refusal and the mark: then nobody would read it.
  return claimMirror(db, userId);
}

/** Lets go of the mirror, unless a caller deferred since the pass began. True when released. */
async function releaseMirror(db: IteraClient, userId: string, token: string): Promise<boolean> {
  const { data, error } = await db
    .from('companions')
    .update({ mirror_claimed_at: null, mirror_due: false, mirror_error: null })
    .eq('user_id', userId)
    .eq('mirror_claimed_at', token)
    .eq('mirror_dirty', false)
    .select('user_id');
  if (error) throw new Error(`companions mirror release: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * Brings the companion's asset to the database's current values. One invocation
 * per companion writes at a time: it reads the row immediately before each
 * write, and writes again while callers that found it busy keep marking the
 * row dirty, so the last confirmed write is the latest state. A caller that
 * cannot take the mirror within `waitMs` sends nothing. Never throws: a failed
 * write is flagged `mirror_due` and retried by the next call.
 */
export async function syncMirror(db: IteraClient, userId: string, waitMs = 0): Promise<MirrorResult> {
  let token: string | null = null;
  let write: ChainWrite | null = null;
  try {
    const minted = await loadCompanion(db, userId);
    if (!minted || minted.mint_status !== 'minted' || !minted.asset_address) return { synced: false, write: null, deferred: false };
    token = await claimOrDefer(db, userId, waitMs);
    if (!token) return { synced: false, write: null, deferred: true };

    for (let pass = 1; ; pass += 1) {
      const row = await loadCompanion(db, userId);
      if (!row || !row.asset_address) throw new Error('companions: row missing during mirror');
      const now = new Date();
      const attributes = companionAttributes(snapshotOf(row, await loadStats(db, userId, now), now));
      if (!sameAttributes(row.mirrored, attributes)) {
        const [sdk, config] = await Promise.all([import('./chain.ts'), loadConfig(db)]);
        const collection = config[COLLECTIONS.companions.configKey];
        if (!collection) throw new Error('companions collection is not configured');
        const signature = await sdk.updateCredentialAttributes(sdk.loadChain(), { asset: row.asset_address, collection, attributes });
        write = { asset: row.asset_address, signature, at: new Date().toISOString(), attributes, changed: changedAttributes(row.mirrored, attributes) };
        const { error } = await db.from('companions').update({ mirrored: attributes, mirrored_at: write.at }).eq('user_id', userId);
        if (error) throw new Error(`companions mirror: ${error.message}`);
      }

      const released = await releaseMirror(db, userId, token);
      const step = afterPass({ dirty: !released, pass });
      if (step === 'release') return { synced: true, write, deferred: false };
      if (step === 'yield') break;
      // Another pass: keep the claim fresh and start counting deferrals again.
      const renewed = new Date().toISOString();
      const { data, error } = await db
        .from('companions')
        .update({ mirror_claimed_at: renewed, mirror_dirty: false })
        .eq('user_id', userId)
        .eq('mirror_claimed_at', token)
        .select('user_id');
      if (error) throw new Error(`companions mirror renew: ${error.message}`);
      if ((data ?? []).length === 0) return { synced: false, write, deferred: false };
      token = renewed;
    }
    await db.from('companions').update({ mirror_claimed_at: null, mirror_due: true }).eq('user_id', userId).eq('mirror_claimed_at', token);
    return { synced: false, write, deferred: false };
  } catch (error) {
    console.error('companion mirror failed', error);
    const message = String(error instanceof Error ? error.message : error).slice(0, 300);
    await db.from('companions').update({ mirror_due: true, mirror_error: message }).eq('user_id', userId);
    if (token) await db.from('companions').update({ mirror_claimed_at: null }).eq('user_id', userId).eq('mirror_claimed_at', token);
    return { synced: false, write, deferred: false };
  }
}

/**
 * The mirror with a time budget, for a request that should carry the proof but
 * must not wait for a slow chain. Past the budget the write keeps going in the
 * background, the row is flagged `mirror_due` and the answer is `null`.
 */
export async function mirrorWithin(db: IteraClient, userId: string, budgetMs: number): Promise<ChainWrite | null> {
  const work = syncMirror(db, userId, budgetMs / 2);
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
