import { sha256Hex } from './sha256.ts';

/**
 * The day chest, as pure rules. Nothing here reads a table, a clock or the
 * network, and nothing is imported but a plain-TS SHA-256, so the browser runs
 * this same file to recompute a chest on `/verify`.
 *
 * The order of events is what makes the roll fair:
 *   1. COMMIT. When a day is stamped, the certification asset gets the attribute
 *      `chest:<day>` = `<target slot>.<effort level>.<pool hash, 8 hex>`, in a
 *      transaction that lands BEFORE the target slot.
 *   2. SEED. `sha256("itera-chest:v1|<blockhash>|<certification>|<day>")`, where
 *      the blockhash is the one of the first block produced at or after the
 *      target slot. Nobody knew it when the commitment was written.
 *   3. ROLL. Tier and Tera are a function of (seed, level, pool, the Teras the
 *      learner cannot receive). `rollChest` is that function.
 */

export const CHEST_VERSION = 1;
export const CHEST_ATTRIBUTE_PREFIX = 'chest:';
/** How far ahead of the slot read at stamp time the committed slot is (a slot is about 0.4 s). */
export const CHEST_SLOT_DISTANCE = 32;
/** `getBlocks(target, target + CHEST_BLOCK_WINDOW)`: its first entry is the block of the seed. */
export const CHEST_BLOCK_WINDOW = 5000;
export const SEED_DOMAIN = 'itera-chest:v1';
export const ODDS_TOTAL = 10_000;

export const CHEST_TIERS = ['common', 'rare', 'epic', 'legendary', 'mythic', 'primordial'] as const;
export type ChestTier = (typeof CHEST_TIERS)[number];
export type EffortLevel = 0 | 1 | 2 | 3;

/**
 * The published odds, in parts of 10 000, by effort level. Each row adds up to
 * 10 000. Effort moves the weight upwards; the lowest level cannot reach the
 * one-of-one at all.
 */
export const ODDS_TABLE: Record<EffortLevel, Record<ChestTier, number>> = {
  0: { common: 7000, rare: 2500, epic: 450, legendary: 45, mythic: 5, primordial: 0 },
  1: { common: 6000, rare: 3000, epic: 880, legendary: 100, mythic: 19, primordial: 1 },
  2: { common: 5000, rare: 3400, epic: 1350, legendary: 210, mythic: 36, primordial: 4 },
  3: { common: 3800, rare: 3700, epic: 2000, legendary: 400, mythic: 90, primordial: 10 },
};

/** The share of server-graded answers a day needs for its effort point. */
export const VERIFIED_SHARE_MIN = 0.75;

export interface EffortInput {
  /** Answers of the day the server graded itself. */
  verified: number;
  /** Answers of the day that had something to grade (server-graded plus self-reported). */
  gradable: number;
  /** No answer of the day was graded wrong by the server. */
  clean: boolean;
  /** This day finished the trail: the certification turned gold in the same write. */
  gold: boolean;
}

/** One point each: a day mostly graded by the server, a day with no miss, the day that finishes the trail. */
export function effortLevel(input: EffortInput): EffortLevel {
  const share = input.gradable > 0 && input.verified / input.gradable >= VERIFIED_SHARE_MIN ? 1 : 0;
  return (share + (input.clean ? 1 : 0) + (input.gold ? 1 : 0)) as EffortLevel;
}

/**
 * The effort numbers of a stamped day from the proof its stamp row carries (`verified`, `self_reported`).
 * A day with no server-graded answer has no miss to count and no clean day to reward either.
 */
export function effortOf(proof: unknown, noServerMiss: boolean, gold: boolean): EffortInput {
  const counts = proof && typeof proof === 'object' ? (proof as Record<string, unknown>) : {};
  const count = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0);
  const verified = count(counts.verified);
  return { verified, gradable: verified + count(counts.self_reported), clean: noServerMiss && verified > 0, gold };
}

export function oddsOf(level: EffortLevel): Array<{ tier: ChestTier; weight: number }> {
  return CHEST_TIERS.map((tier) => ({ tier, weight: ODDS_TABLE[level][tier] }));
}

// ---------------------------------------------------------------------------
// The pool: which Teras a chest can give, in a fixed order. Its hash is part of
// the commitment, so the list cannot be rearranged after the seed is known.
// ---------------------------------------------------------------------------

export type ChestPool = Record<ChestTier, string[]>;

export interface PoolItem {
  key: string;
  rarity: string;
  sort: number;
  /** `null`: no price, a free face. Free faces are everyone's and never come out of a chest. */
  price_lamports: number | null;
}

/** Every priced Tera, by tier, ordered by `sort` then key. */
export function buildPool(items: readonly PoolItem[]): ChestPool {
  const pool = Object.fromEntries(CHEST_TIERS.map((tier) => [tier, [] as string[]])) as ChestPool;
  const ordered = [...items].filter((item) => item.price_lamports !== null).sort((a, b) => a.sort - b.sort || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const item of ordered) {
    if ((CHEST_TIERS as readonly string[]).includes(item.rarity)) pool[item.rarity as ChestTier].push(item.key);
  }
  return pool;
}

/** The exact text whose SHA-256 is committed. Key order is fixed by `CHEST_TIERS`. */
export function poolDocument(pool: ChestPool): string {
  return JSON.stringify({ v: CHEST_VERSION, tiers: CHEST_TIERS.map((tier) => [tier, pool[tier]]) });
}

export function poolHash(pool: ChestPool): string {
  return sha256Hex(poolDocument(pool));
}

/** The pool a stored document describes, or `null` when the text is not one. */
export function parsePoolDocument(text: string): ChestPool | null {
  try {
    const parsed = JSON.parse(text) as { v?: unknown; tiers?: unknown };
    if (parsed.v !== CHEST_VERSION || !Array.isArray(parsed.tiers) || parsed.tiers.length !== CHEST_TIERS.length) return null;
    const pool = {} as ChestPool;
    for (let index = 0; index < CHEST_TIERS.length; index += 1) {
      const entry = parsed.tiers[index];
      if (!Array.isArray(entry) || entry[0] !== CHEST_TIERS[index] || !Array.isArray(entry[1]) || !entry[1].every((key) => typeof key === 'string')) return null;
      pool[CHEST_TIERS[index]] = [...(entry[1] as string[])];
    }
    return pool;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The commitment written on the certification asset.
// ---------------------------------------------------------------------------

export interface ChestCommit {
  slot: number;
  level: EffortLevel;
  /** The first 8 hex characters of the pool hash. */
  pool: string;
}

const COMMIT_SHAPE = /^([1-9][0-9]{0,15})\.([0-3])\.([0-9a-f]{8})$/;

export function commitValue(commit: { slot: number; level: EffortLevel; poolHash: string }): string {
  return `${commit.slot}.${commit.level}.${commit.poolHash.slice(0, 8)}`;
}

export function parseCommit(value: string | null | undefined): ChestCommit | null {
  const match = COMMIT_SHAPE.exec(value ?? '');
  if (!match) return null;
  const slot = Number(match[1]);
  return Number.isSafeInteger(slot) ? { slot, level: Number(match[2]) as EffortLevel, pool: match[3] } : null;
}

export function chestAttributeKey(day: number): string {
  return `${CHEST_ATTRIBUTE_PREFIX}${day}`;
}

interface Attribute {
  key: string;
  value: string;
}

const encoder = new TextEncoder();
const bytesOf = (attributes: readonly Attribute[]) => attributes.reduce((total, { key, value }) => total + 8 + encoder.encode(key).length + encoder.encode(value).length, 0);

/** The commitments a certification row carries in `state.chests`: `{ "<day>": "<slot>.<level>.<pool>" }`, well-formed ones only. */
export function chestsOf(state: Record<string, unknown>): Map<number, string> {
  const found = new Map<number, string>();
  const raw = state.chests;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return found;
  for (const [day, value] of Object.entries(raw as Record<string, unknown>)) {
    const number = Number(day);
    if (Number.isInteger(number) && number >= 1 && number <= 99 && typeof value === 'string' && parseCommit(value)) found.set(number, value);
  }
  return found;
}

/** The row with `state.chests` set from the table of record (absent when there is none). */
export function withChests<Row extends { state: Record<string, unknown> }>(row: Row, commits: ReadonlyMap<number, string>): Row {
  const { chests: _previous, ...rest } = row.state;
  if (commits.size === 0) return 'chests' in row.state ? { ...row, state: rest } : row;
  const chests = Object.fromEntries([...commits].sort(([a], [b]) => a - b).map(([day, value]) => [String(day), value]));
  return { ...row, state: { ...rest, chests } };
}

/**
 * `chest:<day>` attributes that fit next to everything else the asset carries.
 * They are sized LAST, so a commitment never shortens a claim hash and never
 * makes a stamp too big to send: when the room ends, the oldest days are left
 * out (their chests were settled long ago; the commit transaction still shows them).
 */
export function chestAttributes(commits: ReadonlyMap<number, string>, others: readonly Attribute[], budgetBytes: number): Attribute[] {
  let used = bytesOf(others);
  const kept: Attribute[] = [];
  for (const [day, value] of [...commits].sort(([a], [b]) => b - a)) {
    const attribute = { key: chestAttributeKey(day), value };
    const size = bytesOf([attribute]);
    if (used + size > budgetBytes) break;
    used += size;
    kept.push(attribute);
  }
  return kept.reverse();
}

/** The commitments an asset carries on chain: day -> the attribute value. */
export function onchainChests(attributes: readonly Attribute[]): Map<number, string> {
  const found = new Map<number, string>();
  for (const { key, value } of attributes) {
    if (!key.startsWith(CHEST_ATTRIBUTE_PREFIX)) continue;
    const day = Number(key.slice(CHEST_ATTRIBUTE_PREFIX.length));
    if (Number.isInteger(day) && day >= 1 && parseCommit(value)) found.set(day, value);
  }
  return found;
}

/** A Borsh string: its length as a little-endian u32, then the UTF-8 bytes. */
function borshString(text: string): number[] {
  const bytes = encoder.encode(text);
  return [bytes.length & 0xff, (bytes.length >>> 8) & 0xff, (bytes.length >>> 16) & 0xff, (bytes.length >>> 24) & 0xff, ...bytes];
}

/**
 * Whether the data of an `updatePlugin` / `create` instruction (decoded from
 * base58) carries the attribute `chest:<day>` with exactly this value: the key
 * and the value as two Borsh strings, one after the other.
 */
export function instructionCommits(data: Uint8Array, day: number, value: string): boolean {
  const needle = [...borshString(chestAttributeKey(day)), ...borshString(value)];
  outer: for (let start = 0; start + needle.length <= data.length; start += 1) {
    for (let index = 0; index < needle.length; index += 1) if (data[start + index] !== needle[index]) continue outer;
    return true;
  }
  return false;
}

/** The commitment is valid only when the transaction that wrote it landed in a slot BEFORE the slot it names. */
export function commitLandedInTime(transactionSlot: number, commit: ChestCommit): boolean {
  return Number.isSafeInteger(transactionSlot) && transactionSlot > 0 && transactionSlot < commit.slot;
}

// ---------------------------------------------------------------------------
// Seed and roll.
// ---------------------------------------------------------------------------

/** 64 hex characters. `blockhash` and `certification` are base58 text exactly as the RPC and the explorer show them. */
export function chestSeed(blockhash: string, certification: string, day: number): string {
  return sha256Hex(`${SEED_DOMAIN}|${blockhash}|${certification}|${day}`);
}

export interface RollInput {
  /** `chestSeed(...)`. */
  seed: string;
  level: EffortLevel;
  pool: ChestPool;
  /** Teras this chest cannot give: the ones the learner holds already and the ones whose edition is used up. */
  unavailable: readonly string[];
}

export interface RollResult {
  /** The tier the seed picked. */
  rolled_tier: ChestTier;
  /** The tier of the Tera given: the rolled one unless every Tera of it was unavailable. */
  tier: ChestTier | null;
  /** `null` only when the learner already holds every Tera there is. */
  key: string | null;
  /** The two numbers read from the seed. */
  tier_roll: number;
  start_roll: number;
  steps: string[];
}

const SEED_SHAPE = /^[0-9a-f]{64}$/;

/** The tiers tried, in order: the rolled one, then each lower one, then each higher one. */
export function tierWalk(rolled: ChestTier): ChestTier[] {
  const index = CHEST_TIERS.indexOf(rolled);
  return [rolled, ...CHEST_TIERS.slice(0, index).reverse(), ...CHEST_TIERS.slice(index + 1)];
}

/**
 * THE roll. `tier_roll` = the first 8 hex characters of the seed as an integer,
 * modulo 10 000, read against the cumulative odds of the level (common first).
 * `start_roll` = the next 8 hex characters as an integer; inside a tier the walk
 * starts at `start_roll mod (size of the tier)` and moves forward, wrapping,
 * past every unavailable Tera. A tier with nothing left hands over to the next
 * tier of `tierWalk`. No chest is empty while one Tera is left anywhere.
 */
export function rollChest(input: RollInput): RollResult {
  if (!SEED_SHAPE.test(input.seed)) throw new Error('rollChest: the seed must be 64 lowercase hex characters');
  const steps: string[] = [];
  const tierRoll = Number.parseInt(input.seed.slice(0, 8), 16) % ODDS_TOTAL;
  const startRoll = Number.parseInt(input.seed.slice(8, 16), 16);
  const odds = oddsOf(input.level);
  let cumulative = 0;
  let rolled: ChestTier = CHEST_TIERS[0];
  for (const { tier, weight } of odds) {
    cumulative += weight;
    if (tierRoll < cumulative) {
      rolled = tier;
      break;
    }
  }
  steps.push(`tier_roll = 0x${input.seed.slice(0, 8)} mod ${ODDS_TOTAL} = ${tierRoll}`);
  steps.push(`level ${input.level} odds ${odds.map(({ tier, weight }) => `${tier}:${weight}`).join(' ')} -> ${rolled}`);
  steps.push(`start_roll = 0x${input.seed.slice(8, 16)} = ${startRoll}`);

  const blocked = new Set(input.unavailable);
  for (const tier of tierWalk(rolled)) {
    const keys = input.pool[tier] ?? [];
    if (keys.length === 0) {
      steps.push(`${tier}: empty tier`);
      continue;
    }
    const start = startRoll % keys.length;
    for (let offset = 0; offset < keys.length; offset += 1) {
      const key = keys[(start + offset) % keys.length];
      if (blocked.has(key)) continue;
      steps.push(`${tier}: start ${startRoll} mod ${keys.length} = ${start}, skipped ${offset} unavailable -> ${key}`);
      return { rolled_tier: rolled, tier, key, tier_roll: tierRoll, start_roll: startRoll, steps };
    }
    steps.push(`${tier}: all ${keys.length} unavailable`);
  }
  steps.push('nothing left in any tier');
  return { rolled_tier: rolled, tier: null, key: null, tier_roll: tierRoll, start_roll: startRoll, steps };
}

/** What a stranger types in to redo a chest: everything public, in one object. */
export interface RecomputeInput {
  blockhash: string;
  certification: string;
  day: number;
  /** The `chest:<day>` attribute as read from the asset or from the commit transaction. */
  commit: string;
  /** The published pool document whose hash starts with the commitment's pool part. */
  poolDocument: string;
  unavailable: readonly string[];
}

export type RecomputeResult = ({ ok: true; seed: string } & RollResult) | { ok: false; error: 'bad_commit' | 'bad_pool' | 'pool_mismatch' };

/** Seed and roll from the public inputs, checking the pool against the commitment first. */
export function recomputeChest(input: RecomputeInput): RecomputeResult {
  const commit = parseCommit(input.commit);
  if (!commit) return { ok: false, error: 'bad_commit' };
  const pool = parsePoolDocument(input.poolDocument);
  if (!pool) return { ok: false, error: 'bad_pool' };
  if (!sha256Hex(input.poolDocument).startsWith(commit.pool)) return { ok: false, error: 'pool_mismatch' };
  const seed = chestSeed(input.blockhash, input.certification, input.day);
  return { ok: true, seed, ...rollChest({ seed, level: commit.level, pool, unavailable: input.unavailable }) };
}

export const CHEST_FORMULA =
  'seed = sha256("itera-chest:v1|" + blockhash + "|" + certification + "|" + day); ' +
  'tier = cumulative odds of the committed level at (int(seed[0..8]) mod 10000); ' +
  'tera = first available key walking the tier of the committed pool from (int(seed[8..16]) mod size)';
