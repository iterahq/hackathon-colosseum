import { AVATAR_ASSET_COLUMNS, loadAvatarCatalog, loadSupply, mintAvatar, supabaseUrl } from './avatar-store.ts';
import { avatarImageUrl, earnedAttributes, isEarnOnly, isOwnedRow, lowestFreeSerial, teraProof, tierName, type AvatarAssetRow, type AvatarCatalog } from './avatars.ts';
import type { Lang } from './art.ts';
import { markClaimsWritten } from './claims-store.ts';
import { onchainAttributes, pickText, explorerUrl, type AchievementRow, type CatalogEntry } from './credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, loadConfig, type IteraClient } from './db.ts';
import { rpc, withinMs } from './rpc.ts';
import { base58Bytes } from './solana-tx.ts';
import {
  CHEST_BLOCK_WINDOW,
  CHEST_FORMULA,
  CHEST_SLOT_DISTANCE,
  ODDS_TABLE,
  buildPool,
  chestAttributeKey,
  chestSeed,
  commitLandedInTime,
  commitValue,
  effortLevel,
  effortOf,
  instructionCommits,
  oddsOf,
  onchainChests,
  parseCommit,
  parsePoolDocument,
  poolDocument,
  poolHash,
  rollChest,
  withChests,
  chestsOf,
  CHEST_TIERS,
  type ChestPool,
  type ParsedPool,
  type EffortInput,
  type EffortLevel,
} from './tera-roll.ts';

/** `itera.onchain_config.tera_chest`: `on` opens chests; anything else and the backend behaves as before the chest existed. */
export const CHEST_SWITCH = 'tera_chest';
const UNIQUE_VIOLATION = '23505';
/** A settle that died keeps its claim this long before another call may take the chest. */
const STALE_CLAIM_MS = 90_000;
const MAX_ATTEMPTS = 40;
/** A commitment that landed late is written again at most this many times. */
const MAX_COMMITS = 4;
const SLOT_MS = 400;
const PLAN_BUDGET_MS = 1_200;
const SERIAL_ATTEMPTS = 6;

export const CHEST_COLUMNS =
  'id,user_id,certification_id,lesson_id,day,status,commit_slot,commit_value,commit_via,commit_tx,commit_tx_slot,commits,level,inputs,pool_hash,seed_slot,seed_blockhash,seed,tier,item_key,roll,error,attempts,claimed_at,created_at,settled_at';

export interface ChestRow {
  id: string;
  user_id: string;
  certification_id: string;
  lesson_id: string;
  day: number;
  status: 'committed' | 'rolling' | 'minted' | 'failed';
  commit_slot: number;
  commit_value: string;
  commit_via: 'stamp' | 'own_write';
  commit_tx: string | null;
  commit_tx_slot: number | null;
  commits: number;
  level: number;
  inputs: Record<string, unknown>;
  pool_hash: string;
  seed_slot: number | null;
  seed_blockhash: string | null;
  seed: string | null;
  tier: string | null;
  item_key: string | null;
  roll: { unavailable?: string[]; held?: string[]; exhausted?: string[]; steps?: string[]; rolled_tier?: string } | null;
  error: string | null;
  attempts: number;
  claimed_at: string | null;
  created_at: string;
  settled_at: string | null;
}

export function chestsEnabled(config: Record<string, string>): boolean {
  return config[CHEST_SWITCH] === 'on';
}

const message = (error: unknown) => String(error instanceof Error ? error.message : error).slice(0, 300);

const storedPools = new Set<string>();

/** The pool a chest opened now commits to, stored by its hash so it can be served for as long as a chest names it. */
async function currentPool(db: IteraClient): Promise<{ hash: string; pool: ChestPool }> {
  const catalog = await loadAvatarCatalog(db);
  // The tiers that are never sold are named in the committed document: the walk never climbs into one.
  const earnOnly = CHEST_TIERS.filter((tier) => catalog.tiers.get(tier)?.earn_only === true);
  // On the shelf, or of a tier that is earned only: a Tera retired from a tier that is sold is not given either.
  const pool = buildPool([...catalog.items.values()].filter((item) => item.active || isEarnOnly(catalog, item)));
  const hash = poolHash(pool, earnOnly);
  if (!storedPools.has(hash)) {
    const { error } = await db.from('tera_chest_pools').upsert({ hash, document: poolDocument(pool, earnOnly) }, { onConflict: 'hash', ignoreDuplicates: true });
    if (error) throw new Error(`tera_chest_pools: ${error.message}`);
    storedPools.add(hash);
  }
  return { hash, pool };
}

async function loadPool(db: IteraClient, hash: string): Promise<ParsedPool & { document: string }> {
  const { data, error } = await db.from('tera_chest_pools').select('document').eq('hash', hash).maybeSingle();
  if (error) throw new Error(`tera_chest_pools: ${error.message}`);
  const parsed = data ? parsePoolDocument(data.document as string) : null;
  if (!data || !parsed) throw new Error(`pool ${hash.slice(0, 8)} is not stored`);
  return { ...parsed, document: data.document as string };
}

const confirmedSlot = () => rpc<number>('getSlot', [{ commitment: 'confirmed' }]);

/** The lessons among these where the server graded an answer wrong: a day with one is not a clean day. */
async function lessonsWithMisses(db: IteraClient, userId: string, lessonIds: string[]): Promise<Set<string>> {
  if (lessonIds.length === 0) return new Set();
  const { data, error } = await db.from('graded_attempts').select('lesson_id').eq('user_id', userId).eq('mode', 'server').eq('passed', false).in('lesson_id', lessonIds).limit(1000);
  if (error) throw new Error(`graded_attempts: ${error.message}`);
  return new Set((data ?? []).map((row) => row.lesson_id as string));
}

export interface PlannedCommit {
  day: number;
  lessonId: string;
  slot: number;
  level: EffortLevel;
  inputs: EffortInput;
  value: string;
  poolHash: string;
}

/**
 * The commitments the stamp transaction being built should carry: one per day
 * it stamps. `null` when the chest is off, when nothing can be planned inside
 * the budget, or on any error: the stamp then goes out exactly as it always did.
 */
export async function planStampCommits(
  db: IteraClient,
  config: Record<string, string>,
  input: { userId: string; certification: Pick<AchievementRow, 'id' | 'state'>; dayRows: AchievementRow[] },
): Promise<PlannedCommit[] | null> {
  if (!chestsEnabled(config) || input.dayRows.length === 0) return null;
  try {
    const work = (async () => {
      const lessonIds = input.dayRows.map((row) => row.ref_id);
      const [slot, pool, misses, known] = await Promise.all([
        confirmedSlot(),
        currentPool(db),
        lessonsWithMisses(db, input.userId, lessonIds),
        db.from('tera_chests').select('day,status,commit_tx').eq('certification_id', input.certification.id),
      ]);
      if (known.error) throw new Error(known.error.message);
      // A day whose commitment already landed keeps it: only a day never committed, or committed by a write that did not land, is planned.
      const settled = new Set(((known.data ?? []) as Array<{ day: number; status: string; commit_tx: string | null }>).filter((row) => row.status !== 'committed' || row.commit_tx !== null).map((row) => row.day));
      const goldDay = input.certification.state.tier === 'gold' ? [...input.dayRows].sort((a, b) => b.earned_at.localeCompare(a.earned_at))[0]?.id : null;
      return input.dayRows.flatMap((row): PlannedCommit[] => {
        const day = typeof row.state.day === 'number' ? row.state.day : 0;
        if (!Number.isInteger(day) || day < 1 || day > 99 || settled.has(day)) return [];
        const inputs = effortOf(row.state.proof, !misses.has(row.ref_id), row.id === goldDay);
        const level = effortLevel(inputs);
        const target = slot + CHEST_SLOT_DISTANCE;
        return [{ day, lessonId: row.ref_id, slot: target, level, inputs, value: commitValue({ slot: target, level, poolHash: pool.hash }), poolHash: pool.hash }];
      });
    })();
    work.catch(() => undefined);
    return await withinMs(work, PLAN_BUDGET_MS);
  } catch (error) {
    console.error('tera chests: plan failed', message(error));
    return null;
  }
}

/** The row with the planned commitments added to the ones it already carries. */
export function withPlannedCommits<Row extends { state: Record<string, unknown> }>(row: Row, planned: readonly PlannedCommit[]): Row {
  const commits = new Map(chestsOf(row.state));
  for (const plan of planned) commits.set(plan.day, plan.value);
  return withChests(row, commits);
}

/**
 * Records the commitments that made it into the attribute list about to be
 * sent. A day whose earlier commitment never landed takes the new one. Never
 * throws: a commitment that is on chain and not in the table is found again by
 * the settle path, which commits the day by its own write.
 */
export async function saveStampCommits(db: IteraClient, userId: string, certificationId: string, planned: readonly PlannedCommit[], attributes: ReadonlyArray<{ key: string; value: string }>): Promise<void> {
  try {
    const written = onchainChests(attributes);
    for (const plan of planned.filter((entry) => written.get(entry.day) === entry.value)) {
      const row = { user_id: userId, certification_id: certificationId, lesson_id: plan.lessonId, day: plan.day, commit_slot: plan.slot, commit_value: plan.value, commit_via: 'stamp', level: plan.level, inputs: plan.inputs, pool_hash: plan.poolHash };
      const { data, error } = await db.from('tera_chests').upsert(row, { onConflict: 'certification_id,day', ignoreDuplicates: true }).select('id');
      if (error) throw new Error(error.message);
      if ((data ?? []).length > 0) continue;
      const { error: moveError } = await db
        .from('tera_chests')
        .update({ commit_slot: plan.slot, commit_value: plan.value, level: plan.level, inputs: plan.inputs, pool_hash: plan.poolHash })
        .eq('certification_id', certificationId)
        .eq('day', plan.day)
        .eq('status', 'committed')
        .is('commit_tx', null);
      if (moveError) throw new Error(moveError.message);
    }
  } catch (error) {
    console.error('tera chests: commitments not recorded', message(error));
  }
}

// ---------------------------------------------------------------------------
// Settlement: verify the commitment, read the seed block, roll, mint. Each step
// is safe to run again; one invocation works on a chest at a time.
// ---------------------------------------------------------------------------

async function loadChest(db: IteraClient, id: string): Promise<ChestRow | null> {
  const { data, error } = await db.from('tera_chests').select(CHEST_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`tera_chests: ${error.message}`);
  return data as ChestRow | null;
}

async function patchChest(db: IteraClient, id: string, patch: Record<string, unknown>): Promise<ChestRow> {
  const { data, error } = await db.from('tera_chests').update(patch).eq('id', id).select(CHEST_COLUMNS).single();
  if (error) throw new Error(`tera_chests update: ${error.message}`);
  return data as ChestRow;
}

async function claimChest(db: IteraClient, id: string): Promise<ChestRow | null> {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data, error } = await db
    .from('tera_chests')
    .update({ claimed_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['committed', 'rolling'])
    .or(`claimed_at.is.null,claimed_at.lt."${staleBefore}"`)
    .select(CHEST_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`tera_chests claim: ${error.message}`);
  return data as ChestRow | null;
}

async function loadCertification(db: IteraClient, id: string): Promise<AchievementRow | null> {
  const { data, error } = await db.from('user_achievements').select(ROW_COLUMNS).eq('id', id).eq('achievement_key', 'trail_pass').maybeSingle();
  if (error) throw new Error(`user_achievements: ${error.message}`);
  return data as AchievementRow | null;
}

async function loadDayStamp(db: IteraClient, userId: string, lessonId: string): Promise<AchievementRow | null> {
  const { data, error } = await db.from('user_achievements').select(ROW_COLUMNS).eq('user_id', userId).eq('achievement_key', 'day_stamp').eq('ref_id', lessonId).maybeSingle();
  if (error) throw new Error(`user_achievements: ${error.message}`);
  return data as AchievementRow | null;
}

interface RpcTransaction {
  slot: number;
  meta: { err: unknown } | null;
  transaction: { message: { accountKeys: string[]; instructions: Array<{ data: string }> } };
}

type CommitCheck = 'valid' | 'unknown' | 'invalid';

/** Reads the commit transaction from chain: it must have succeeded, touch the certification, carry `chest:<day>` = the value, and sit in a slot before the one it names. */
async function checkCommit(chest: ChestRow, certificationAsset: string): Promise<{ verdict: CommitCheck; slot: number | null }> {
  const commit = parseCommit(chest.commit_value);
  if (!commit || !chest.commit_tx) return { verdict: 'invalid', slot: null };
  const transaction = await rpc<RpcTransaction | null>('getTransaction', [chest.commit_tx, { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 0 }]);
  // The node may not serve a transaction it confirmed a moment ago: ask again later.
  if (!transaction) return { verdict: 'unknown', slot: null };
  const carries =
    transaction.meta?.err === null &&
    transaction.transaction.message.accountKeys.includes(certificationAsset) &&
    transaction.transaction.message.instructions.some((instruction) => {
      const data = base58Bytes(instruction.data);
      return data !== null && instructionCommits(data, chest.day, chest.commit_value);
    });
  return { verdict: carries && commitLandedInTime(transaction.slot, commit) ? 'valid' : 'invalid', slot: transaction.slot };
}

/**
 * Commits a day by its own write of the certification's attributes: for a day
 * whose stamp carried no commitment, or whose commitment landed at or after its
 * slot. The new slot is in the future again, and the roll waits for it.
 */
async function commitByOwnWrite(db: IteraClient, config: Record<string, string>, certification: AchievementRow, draft: { userId: string; lessonId: string; day: number; inputs: EffortInput; existing: ChestRow | null }): Promise<ChestRow> {
  if (!certification.asset_address || !config.collection_passports) throw new Error('certification is not on chain');
  if (draft.existing && draft.existing.commits >= MAX_COMMITS) {
    return patchChest(db, draft.existing.id, { status: 'failed', error: 'commitment_never_landed_in_time', claimed_at: null });
  }
  // Everything slow happens first, so the slot is read as late as it can be: the write has to land before the slot it names.
  const { restoreCosmetics } = await import('./cosmetics-store.ts');
  const [pool, catalog, [current], sdk] = await Promise.all([
    currentPool(db),
    db.from('achievements').select(CATALOG_COLUMNS).eq('key', 'trail_pass').single(),
    restoreCosmetics(db, [certification]),
    import('./chain.ts'),
  ]);
  if (catalog.error) throw new Error(`achievements: ${catalog.error.message}`);
  const chain = sdk.loadChain();
  const level = effortLevel(draft.inputs);
  const target = (await confirmedSlot()) + CHEST_SLOT_DISTANCE;
  const value = commitValue({ slot: target, level, poolHash: pool.hash });
  const fields = { commit_slot: target, commit_value: value, commit_via: 'own_write', commit_tx: null, commit_tx_slot: null, level, inputs: draft.inputs, pool_hash: pool.hash };
  // The attribute list as every writer builds it (what was paid for, endorsed, proven and committed), with this day's commitment.
  const attributes = onchainAttributes(withPlannedCommits(current, [{ day: draft.day, lessonId: draft.lessonId, slot: target, level, inputs: draft.inputs, value, poolHash: pool.hash }]), catalog.data as CatalogEntry);
  const fits = onchainChests(attributes).get(draft.day) === value;

  let chest: ChestRow;
  if (draft.existing) {
    chest = await patchChest(db, draft.existing.id, { ...fields, commits: draft.existing.commits + 1 });
  } else {
    const { data, error } = await db
      .from('tera_chests')
      .insert({ user_id: draft.userId, certification_id: certification.id, lesson_id: draft.lessonId, day: draft.day, claimed_at: new Date().toISOString(), ...fields })
      .select(CHEST_COLUMNS)
      .maybeSingle();
    // Another call opened this day's chest first: that row is the chest.
    if (error?.code === UNIQUE_VIOLATION || (!error && !data)) {
      const { data: winner, error: readError } = await db.from('tera_chests').select(CHEST_COLUMNS).eq('certification_id', certification.id).eq('day', draft.day).single();
      if (readError) throw new Error(`tera_chests: ${readError.message}`);
      return winner as ChestRow;
    }
    if (error) throw new Error(`tera_chests insert: ${error.message}`);
    chest = data as ChestRow;
  }
  if (!fits) return patchChest(db, chest.id, { status: 'failed', error: 'commitment_does_not_fit_the_asset', claimed_at: null });
  const signature = await sdk.updateCredentialAttributes(chain, { asset: certification.asset_address, collection: config.collection_passports, attributes });
  await markClaimsWritten(db, certification.id, signature);
  // A chest opened here was held from its insert on, so nobody settled it while the write was in flight.
  return patchChest(db, chest.id, { commit_tx: signature, error: null, ...(draft.existing ? {} : { claimed_at: null }) });
}

interface SeedBlock {
  slot: number;
  blockhash: string;
}

/** The first block produced at or after the committed slot, or `null` while the chain has not reached it. */
async function seedBlock(commitSlot: number): Promise<SeedBlock | null> {
  if ((await confirmedSlot()) <= commitSlot) return null;
  const slots = await rpc<number[]>('getBlocks', [commitSlot, commitSlot + CHEST_BLOCK_WINDOW, { commitment: 'confirmed' }]);
  if (!Array.isArray(slots) || slots.length === 0) return null;
  const block = await rpc<{ blockhash: string } | null>('getBlock', [slots[0], { commitment: 'confirmed', transactionDetails: 'none', rewards: false, maxSupportedTransactionVersion: 0 }]);
  return block?.blockhash ? { slot: slots[0], blockhash: block.blockhash } : null;
}

async function chestAsset(db: IteraClient, chestId: string): Promise<AvatarAssetRow | null> {
  const { data, error } = await db.from('avatar_assets').select(AVATAR_ASSET_COLUMNS).eq('chest_id', chestId).maybeSingle();
  if (error) throw new Error(`avatar_assets: ${error.message}`);
  return data as AvatarAssetRow | null;
}

/**
 * Rolls the chest and takes the unit: the `avatar_assets` row IS the result. Its
 * unique indexes decide every race: (chest_id) one Tera per chest, (user, item)
 * a Tera the learner got meanwhile is skipped by rolling again, (item, serial)
 * a serial somebody took is proposed again.
 */
async function rollAndReserve(db: IteraClient, chest: ChestRow, catalog: AvatarCatalog): Promise<{ chest: ChestRow; asset: AvatarAssetRow | null }> {
  const known = await chestAsset(db, chest.id);
  if (known) return { chest, asset: known };
  const { pool, earnOnly } = await loadPool(db, chest.pool_hash);
  for (let attempt = 0; attempt < SERIAL_ATTEMPTS; attempt += 1) {
    const [rows, supply] = await Promise.all([
      db.from('avatar_assets').select('item_key,mint_status').eq('user_id', chest.user_id),
      loadSupply(db),
    ]);
    if (rows.error) throw new Error(`avatar_assets: ${rows.error.message}`);
    const held = ((rows.data ?? []) as Array<Pick<AvatarAssetRow, 'item_key' | 'mint_status'>>).filter((row) => isOwnedRow(row as AvatarAssetRow)).map((row) => row.item_key).sort();
    const exhausted = [...catalog.items.values()].filter((item) => item.supply_cap !== null && (supply.get(item.key)?.held ?? 0) >= item.supply_cap).map((item) => item.key).sort();
    // A key the pool names and the catalog no longer has cannot be minted.
    const gone = Object.values(pool).flat().filter((key) => !catalog.items.has(key)).sort();
    const unavailable = [...new Set([...held, ...exhausted, ...gone])].sort();
    const result = rollChest({ seed: chest.seed as string, level: chest.level as EffortLevel, pool, unavailable, earnOnly });
    const roll = { held, exhausted, gone, unavailable, steps: result.steps, rolled_tier: result.rolled_tier, tier_roll: result.tier_roll, start_roll: result.start_roll };
    if (!result.key || !result.tier) {
      return { chest: await patchChest(db, chest.id, { status: 'failed', error: 'nothing_left_to_give', roll, claimed_at: null }), asset: null };
    }
    const item = catalog.items.get(result.key);
    const taken = await db.from('avatar_assets').select('serial').eq('item_key', result.key).order('serial').limit(10_000);
    if (taken.error) throw new Error(`avatar_assets serials: ${taken.error.message}`);
    const serial = lowestFreeSerial((taken.data ?? []).map((row) => row.serial as number), item?.supply_cap ?? null);
    if (serial === null) continue;
    const { data, error } = await db
      .from('avatar_assets')
      .insert({ user_id: chest.user_id, item_key: result.key, serial, mint_status: 'pending', origin: 'earned', chest_id: chest.id })
      .select(AVATAR_ASSET_COLUMNS)
      .maybeSingle();
    if (error?.code === UNIQUE_VIOLATION) {
      const other = await chestAsset(db, chest.id);
      if (other) return { chest, asset: other };
      continue;
    }
    if (error) throw new Error(`avatar_assets insert: ${error.message}`);
    if (!data) continue;
    return { chest: await patchChest(db, chest.id, { tier: result.tier, item_key: result.key, roll }), asset: data as AvatarAssetRow };
  }
  throw new Error('could not take a unit for this chest');
}

export interface SettleOutcome {
  chest: ChestRow;
  /** How long until asking again is worth it; absent when the chest is settled or failed. */
  retryAfterMs?: number;
}

/**
 * Moves a chest as far as it can go now. Idempotent: a settled chest is
 * returned as it is, a chest another call holds is returned with a pause.
 * Throws nothing a caller has to handle: a failed step is recorded on the row
 * and tried again by the next call.
 */
export async function settleChest(db: IteraClient, config: Record<string, string>, chestId: string): Promise<SettleOutcome | null> {
  const before = await loadChest(db, chestId);
  if (!before) return null;
  if (before.status === 'minted' || before.status === 'failed') return { chest: before };
  if (!chestsEnabled(config)) return { chest: before };
  let chest = await claimChest(db, chestId);
  if (!chest) return { chest: (await loadChest(db, chestId)) ?? before, retryAfterMs: 2_000 };

  const release = (patch: Record<string, unknown> = {}) => patchChest(db, chestId, { claimed_at: null, ...patch });
  try {
    chest = await patchChest(db, chestId, { attempts: chest.attempts + 1 });
    if (chest.attempts > MAX_ATTEMPTS) return { chest: await release({ status: 'failed', error: chest.error ?? 'too_many_attempts' }) };
    const certification = await loadCertification(db, chest.certification_id);
    if (!certification || certification.mint_status !== 'minted' || !certification.asset_address || !certification.wallet_address) {
      return { chest: await release({ error: 'certification_not_minted' }), retryAfterMs: 4_000 };
    }

    if (chest.status === 'committed') {
      // A commitment by its own write that never got its transaction (the call died mid-way): written again.
      if (!chest.commit_tx && chest.commit_via === 'own_write') {
        const again = await commitByOwnWrite(db, config, certification, { userId: chest.user_id, lessonId: chest.lesson_id, day: chest.day, inputs: chest.inputs as unknown as EffortInput, existing: chest });
        if (again.status === 'failed') return { chest: again };
        return { chest: await release(), retryAfterMs: CHEST_SLOT_DISTANCE * SLOT_MS };
      }
      // The stamp that carried the commitment is the transaction of the day's stamp row.
      if (!chest.commit_tx) {
        const stamp = await loadDayStamp(db, chest.user_id, chest.lesson_id);
        if (!stamp || stamp.mint_status !== 'minted' || !stamp.tx_signature) return { chest: await release({ error: 'day_not_stamped_yet' }), retryAfterMs: 3_000 };
        chest = await patchChest(db, chestId, { commit_tx: stamp.tx_signature });
      }
      const check = await checkCommit(chest, certification.asset_address);
      if (check.verdict === 'unknown') return { chest: await release({ error: 'commit_transaction_not_served_yet' }), retryAfterMs: 2_500 };
      if (check.verdict === 'invalid') {
        const again = await commitByOwnWrite(db, config, certification, { userId: chest.user_id, lessonId: chest.lesson_id, day: chest.day, inputs: chest.inputs as unknown as EffortInput, existing: chest });
        if (again.status === 'failed') return { chest: again };
        return { chest: await release(), retryAfterMs: CHEST_SLOT_DISTANCE * SLOT_MS };
      }
      const block = await seedBlock(chest.commit_slot);
      if (!block) {
        const tip = await confirmedSlot().catch(() => chest!.commit_slot - CHEST_SLOT_DISTANCE);
        return { chest: await release({ commit_tx_slot: check.slot, error: null }), retryAfterMs: Math.min(20_000, Math.max(1_200, (chest.commit_slot - tip + 2) * SLOT_MS)) };
      }
      chest = await patchChest(db, chestId, {
        status: 'rolling',
        commit_tx_slot: check.slot,
        seed_slot: block.slot,
        seed_blockhash: block.blockhash,
        seed: chestSeed(block.blockhash, certification.asset_address, chest.day),
        error: null,
      });
    }

    const catalog = await loadAvatarCatalog(db, true);
    const rolled = await rollAndReserve(db, chest, catalog);
    if (!rolled.asset) return { chest: rolled.chest };
    chest = rolled.chest;
    const item = catalog.items.get(rolled.asset.item_key);
    if (!item) throw new Error(`avatar ${rolled.asset.item_key} left the catalog`);
    const minted = await mintAvatar(db, catalog, item, rolled.asset, certification.wallet_address, {
      attributes: earnedAttributes({
        wallet: certification.wallet_address,
        certification: certification.asset_address,
        day: chest.day,
        commit: chest.commit_value,
        seedSlot: chest.seed_slot as number,
        seedBlockhash: chest.seed_blockhash as string,
      }),
    });
    if (minted.mint_status !== 'minted') return { chest: await release({ error: 'mint_pending' }), retryAfterMs: 3_000 };
    return { chest: await release({ status: 'minted', tier: chest.tier ?? item.rarity, item_key: item.key, settled_at: new Date().toISOString(), error: null }) };
  } catch (error) {
    console.error(`tera chest ${chestId} failed`, message(error));
    return { chest: await release({ error: message(error) }).catch(() => chest as ChestRow), retryAfterMs: 4_000 };
  }
}

/**
 * The chest of a stamped day of this learner: the row the stamp opened, or one
 * opened now by its own commitment when the stamp carried none. `null` when the
 * day is not stamped, is not the learner's, or the chest is switched off and
 * none exists.
 */
export async function chestOfDay(db: IteraClient, config: Record<string, string>, userId: string, lessonId: string): Promise<ChestRow | null> {
  const { data, error } = await db.from('tera_chests').select(CHEST_COLUMNS).eq('user_id', userId).eq('lesson_id', lessonId).maybeSingle();
  if (error) throw new Error(`tera_chests: ${error.message}`);
  if (data) return data as ChestRow;
  if (!chestsEnabled(config)) return null;
  const stamp = await loadDayStamp(db, userId, lessonId);
  const parentId = typeof stamp?.state.parent_id === 'string' ? stamp.state.parent_id : null;
  const day = typeof stamp?.state.day === 'number' ? stamp.state.day : 0;
  if (!stamp || stamp.mint_status !== 'minted' || !parentId || day < 1) return null;
  const certification = await loadCertification(db, parentId);
  if (!certification || certification.user_id !== userId || certification.mint_status !== 'minted') return null;
  const [misses, siblings] = await Promise.all([
    lessonsWithMisses(db, userId, [lessonId]),
    db.from('user_achievements').select('id,earned_at').eq('user_id', userId).eq('achievement_key', 'day_stamp').eq('state->>parent_id', parentId).order('earned_at', { ascending: false }).limit(1),
  ]);
  if (siblings.error) throw new Error(`user_achievements: ${siblings.error.message}`);
  const gold = certification.state.tier === 'gold' && siblings.data?.[0]?.id === stamp.id;
  return commitByOwnWrite(db, config, certification, { userId, lessonId, day, inputs: effortOf(stamp.state.proof, !misses.has(lessonId), gold), existing: null });
}

/** After a stamp: settles the learner's open chests, waiting for each seed block. Runs after the response is sent. */
export async function settleOpenChests(db: IteraClient, config: Record<string, string>, userId: string, budgetMs = 60_000): Promise<void> {
  if (!chestsEnabled(config)) return;
  const deadline = Date.now() + budgetMs;
  const { data, error } = await db.from('tera_chests').select('id').eq('user_id', userId).in('status', ['committed', 'rolling']).order('created_at').limit(5);
  if (error) throw new Error(`tera_chests: ${error.message}`);
  for (const { id } of (data ?? []) as Array<{ id: string }>) {
    while (Date.now() < deadline) {
      const outcome = await settleChest(db, config, id);
      const pause = outcome?.retryAfterMs;
      if (pause === undefined) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(pause, Math.max(0, deadline - Date.now()))));
    }
  }
}

// ---------------------------------------------------------------------------
// Views.
// ---------------------------------------------------------------------------

export interface ChestContext {
  catalog: AvatarCatalog;
  certifications: Map<string, Pick<AchievementRow, 'id' | 'asset_address' | 'state' | 'wallet_address'>>;
  assets: Map<string, AvatarAssetRow>;
}

/** Everything the views of these chests need, in three reads. */
export async function chestContext(db: IteraClient, chests: readonly ChestRow[]): Promise<ChestContext> {
  const certificationIds = [...new Set(chests.map((chest) => chest.certification_id))];
  const chestIds = chests.map((chest) => chest.id);
  const [catalog, certifications, assets] = await Promise.all([
    loadAvatarCatalog(db),
    certificationIds.length > 0 ? db.from('user_achievements').select('id,asset_address,state,wallet_address').in('id', certificationIds) : Promise.resolve({ data: [], error: null }),
    chestIds.length > 0 ? db.from('avatar_assets').select(AVATAR_ASSET_COLUMNS).in('chest_id', chestIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (certifications.error) throw new Error(`user_achievements: ${certifications.error.message}`);
  if (assets.error) throw new Error(`avatar_assets: ${assets.error.message}`);
  return {
    catalog,
    certifications: new Map(((certifications.data ?? []) as Array<Pick<AchievementRow, 'id' | 'asset_address' | 'state' | 'wallet_address'>>).map((row) => [row.id, row])),
    assets: new Map(((assets.data ?? []) as AvatarAssetRow[]).map((row) => [row.chest_id as string, row])),
  };
}

/** The `Chest` of the contract. Nothing here names the learner beyond the public wallet-owned assets. */
export function chestView(chest: ChestRow, context: ChestContext, lang: Lang, retryAfterMs?: number) {
  const certification = context.certifications.get(chest.certification_id);
  const asset = context.assets.get(chest.id);
  const item = chest.item_key ? context.catalog.items.get(chest.item_key) : undefined;
  const address = asset?.mint_status === 'minted' ? asset.asset_address : null;
  return {
    id: chest.id,
    day: chest.day,
    lesson_id: chest.lesson_id,
    trail: pickText(certification?.state.trail_title, lang),
    certification: certification?.asset_address ?? null,
    status: chest.status,
    commit: chest.commit_tx ? { slot: chest.commit_slot, value: chest.commit_value, tx: chest.commit_tx, tx_slot: chest.commit_tx_slot, via: chest.commit_via, explorer_url: explorerUrl('tx', chest.commit_tx) } : null,
    seed: chest.seed_slot !== null && chest.seed_blockhash ? { slot: chest.seed_slot, blockhash: chest.seed_blockhash, value: chest.seed } : null,
    level: chest.level,
    effort: chest.inputs,
    tier: chest.tier,
    odds: oddsOf(chest.level as EffortLevel),
    tera:
      item && chest.status === 'minted'
        ? {
            key: item.key,
            title: pickText(item.title_i18n, lang),
            rarity: item.rarity,
            tier_name: tierName(context.catalog, item, lang),
            serial: asset?.serial ?? null,
            image_url: avatarImageUrl(supabaseUrl(), item),
            thumb_url: avatarImageUrl(supabaseUrl(), item, '128'),
            chip_url: avatarImageUrl(supabaseUrl(), item, 'chip'),
            asset: address,
            ...(address ? { page_url: teraProof(address).page_url, explorer_url: teraProof(address).explorer_url } : { page_url: null, explorer_url: null }),
          }
        : null,
    ...(chest.status === 'failed' ? { error: chest.error } : {}),
    ...(retryAfterMs !== undefined && chest.status !== 'minted' && chest.status !== 'failed' ? { retry_after_ms: retryAfterMs } : {}),
  };
}

/** The `Recompute` of the contract: every input of the roll, where each comes from, and the pool document the commitment names. */
export async function recomputeView(db: IteraClient, chest: ChestRow, context: ChestContext) {
  const certification = context.certifications.get(chest.certification_id);
  const { pool, earnOnly, document } = await loadPool(db, chest.pool_hash);
  return {
    formula: CHEST_FORMULA,
    inputs: {
      certification: certification?.asset_address ?? '',
      day: chest.day,
      commit_attribute: chestAttributeKey(chest.day),
      commit: chest.commit_value,
      commit_slot: chest.commit_slot,
      commit_tx: chest.commit_tx ?? '',
      commit_tx_slot: chest.commit_tx_slot ?? 0,
      level: chest.level,
      pool_hash: chest.pool_hash,
      seed_slot: chest.seed_slot ?? 0,
      blockhash: chest.seed_blockhash ?? '',
      seed: chest.seed ?? '',
    },
    /** Read from the chain by anyone; the rest is what our tables said when the chest was rolled. */
    from_chain: ['certification', 'day', 'commit', 'commit_slot', 'commit_tx', 'commit_tx_slot', 'level', 'pool_hash', 'seed_slot', 'blockhash'],
    from_itera: { effort: chest.inputs, unavailable: chest.roll?.unavailable ?? [], held: chest.roll?.held ?? [], exhausted: chest.roll?.exhausted ?? [] },
    rpc: [
      `getAccountInfo(${certification?.asset_address ?? '<certification>'}) -> Attributes plugin, "${chestAttributeKey(chest.day)}" = "<slot>.<level>.<pool hash 8 hex>"`,
      `getTransaction(${chest.commit_tx ?? '<commit tx>'}) -> slot must be below ${chest.commit_slot}; its instruction data carries the same attribute`,
      `getBlocks(${chest.commit_slot}, ${chest.commit_slot + CHEST_BLOCK_WINDOW})[0] -> the seed slot; getBlock(that slot).blockhash`,
    ],
    pool,
    /** The tiers the walk never climbs into; `null` on the first pools, whose walk climbs anywhere. */
    earn_only: earnOnly,
    pool_document: document,
    odds_table: ODDS_TABLE,
    unavailable: chest.roll?.unavailable ?? [],
    steps: chest.roll?.steps ?? [],
  };
}

/** The `earned` block of a Tera object, for the chests behind these earned Teras: chest id -> block. */
export async function earnedBlocks(db: IteraClient, rows: ReadonlyArray<Pick<AvatarAssetRow, 'chest_id' | 'origin'>>, lang: Lang) {
  const ids = [...new Set(rows.flatMap((row) => (row.origin === 'earned' && row.chest_id ? [row.chest_id] : [])))];
  const blocks = new Map<string, { certification: string; trail: string; day: number; tier: string; chest_id: string }>();
  if (ids.length === 0) return blocks;
  try {
    const { data, error } = await db.from('tera_chests').select('id,day,tier,certification_id').in('id', ids);
    if (error) throw new Error(error.message);
    const chests = (data ?? []) as Array<{ id: string; day: number; tier: string | null; certification_id: string }>;
    const { data: certifications, error: certificationError } = await db.from('user_achievements').select('id,asset_address,state').in('id', [...new Set(chests.map((chest) => chest.certification_id))]);
    if (certificationError) throw new Error(certificationError.message);
    const byId = new Map(((certifications ?? []) as Array<{ id: string; asset_address: string | null; state: Record<string, unknown> }>).map((row) => [row.id, row]));
    for (const chest of chests) {
      const certification = byId.get(chest.certification_id);
      blocks.set(chest.id, { certification: certification?.asset_address ?? '', trail: pickText(certification?.state.trail_title, lang), day: chest.day, tier: chest.tier ?? '', chest_id: chest.id });
    }
  } catch (error) {
    console.error('tera chests: earned blocks unavailable', message(error));
  }
  return blocks;
}

/** `origin`, `transferable`, `proof` and `earned` of a Tera object the learner holds. */
export function originFields(row: Pick<AvatarAssetRow, 'origin' | 'chest_id' | 'asset_address'>, earned: ReadonlyMap<string, unknown>) {
  const origin = row.origin === 'earned' || row.origin === 'sponsor' ? row.origin : 'bought';
  return {
    origin,
    transferable: origin === 'bought',
    proof: row.asset_address ? teraProof(row.asset_address) : null,
    ...(origin === 'earned' && row.chest_id && earned.has(row.chest_id) ? { earned: earned.get(row.chest_id) } : {}),
  };
}
