import { describe, expect, it } from 'vitest';
import { ATTRIBUTE_BUDGET_BYTES, attributeBytes } from './claims';
import { onchainAttributes, type AchievementRow, type CatalogEntry } from './credential';
import { sha256Hex } from './sha256';
import {
  CHEST_TIERS,
  ODDS_TABLE,
  ODDS_TOTAL,
  buildPool,
  chestAttributes,
  chestSeed,
  chestsOf,
  commitLandedInTime,
  instructionCommits,
  commitValue,
  effortLevel,
  effortOf,
  onchainChests,
  parseCommit,
  parsePoolDocument,
  poolDocument,
  poolHash,
  recomputeChest,
  rollChest,
  tierWalk,
  withChests,
  type ChestPool,
  type EffortLevel,
} from './tera-roll';

const POOL: ChestPool = {
  common: ['c1', 'c2', 'c3'],
  rare: ['r1', 'r2'],
  epic: ['e1'],
  legendary: ['l1', 'l2'],
  mythic: ['m1'],
  primordial: ['p1'],
};
/** A seed whose first 8 hex characters are `tier` and next 8 are `start`. */
const seedOf = (tier: number, start: number) => `${tier.toString(16).padStart(8, '0')}${start.toString(16).padStart(8, '0')}${'0'.repeat(48)}`;

describe('odds', () => {
  it('every level adds up to 10 000 and never loses weight at the top as effort grows', () => {
    for (const level of [0, 1, 2, 3] as EffortLevel[]) {
      expect(CHEST_TIERS.reduce((total, tier) => total + ODDS_TABLE[level][tier], 0)).toBe(ODDS_TOTAL);
    }
    for (const tier of ['epic', 'legendary', 'mythic', 'primordial'] as const) {
      expect(ODDS_TABLE[1][tier]).toBeGreaterThan(ODDS_TABLE[0][tier]);
      expect(ODDS_TABLE[2][tier]).toBeGreaterThan(ODDS_TABLE[1][tier]);
      expect(ODDS_TABLE[3][tier]).toBeGreaterThan(ODDS_TABLE[2][tier]);
    }
    expect(ODDS_TABLE[0].primordial).toBe(0);
  });

  it('gives one effort point each for a server-graded day, a clean day and the day that finishes the trail', () => {
    expect(effortLevel({ verified: 0, gradable: 0, clean: false, gold: false })).toBe(0);
    expect(effortLevel({ verified: 10, gradable: 12, clean: false, gold: false })).toBe(1);
    expect(effortLevel({ verified: 8, gradable: 12, clean: false, gold: false })).toBe(0);
    expect(effortLevel({ verified: 9, gradable: 12, clean: true, gold: false })).toBe(2);
    expect(effortLevel({ verified: 12, gradable: 12, clean: true, gold: true })).toBe(3);
    expect(effortLevel({ verified: 0, gradable: 0, clean: true, gold: true })).toBe(2);
  });

  it('reads the effort of a day from the proof of its stamp, and a day nobody graded is never a clean day', () => {
    expect(effortOf({ verified: 10, self_reported: 2, participation: 6, legacy: 0, evidence: 'x' }, true, false)).toEqual({ verified: 10, gradable: 12, clean: true, gold: false });
    expect(effortOf({ verified: 10, self_reported: 2 }, false, true)).toEqual({ verified: 10, gradable: 12, clean: false, gold: true });
    expect(effortOf(undefined, true, false)).toEqual({ verified: 0, gradable: 0, clean: false, gold: false });
    expect(effortOf({ verified: '10', self_reported: -1 }, true, false)).toEqual({ verified: 0, gradable: 0, clean: false, gold: false });
    expect(effortLevel(effortOf({ verified: 10, self_reported: 2 }, true, true))).toBe(3);
  });
});

describe('pool', () => {
  it('lists priced Teras by tier in catalog order and leaves the free faces out', () => {
    const pool = buildPool([
      { key: 'b', rarity: 'rare', sort: 20, price_lamports: 1 },
      { key: 'a', rarity: 'rare', sort: 20, price_lamports: 1 },
      { key: 'z', rarity: 'rare', sort: 10, price_lamports: 1 },
      { key: 'free', rarity: 'common', sort: 1, price_lamports: null },
      { key: 'odd', rarity: 'unknown', sort: 1, price_lamports: 1 },
      { key: 'one', rarity: 'primordial', sort: 99, price_lamports: 1 },
    ]);
    expect(pool.rare).toEqual(['z', 'a', 'b']);
    expect(pool.common).toEqual([]);
    expect(pool.primordial).toEqual(['one']);
  });

  it('hashes one exact document, and reads it back', () => {
    const document = poolDocument(POOL);
    expect(document).toBe('{"v":1,"tiers":[["common",["c1","c2","c3"]],["rare",["r1","r2"]],["epic",["e1"]],["legendary",["l1","l2"]],["mythic",["m1"]],["primordial",["p1"]]]}');
    expect(poolHash(POOL)).toBe(sha256Hex(document));
    expect(parsePoolDocument(document)).toEqual(POOL);
    expect(parsePoolDocument('{"v":2,"tiers":[]}')).toBeNull();
    expect(parsePoolDocument('not json')).toBeNull();
    expect(poolHash({ ...POOL, rare: ['r2', 'r1'] })).not.toBe(poolHash(POOL));
  });
});

describe('commitment', () => {
  it('writes and reads `<slot>.<level>.<pool 8 hex>`', () => {
    const value = commitValue({ slot: 510164365, level: 2, poolHash: 'a1b2c3d4e5f6'.padEnd(64, '0') });
    expect(value).toBe('510164365.2.a1b2c3d4');
    expect(parseCommit(value)).toEqual({ slot: 510164365, level: 2, pool: 'a1b2c3d4' });
    for (const bad of ['', '510164365', '510164365.4.a1b2c3d4', '0.1.a1b2c3d4', '510164365.1.A1B2C3D4', '510164365.1.a1b2c3d', '1e9.1.a1b2c3d4', null, undefined]) {
      expect(parseCommit(bad)).toBeNull();
    }
  });

  it('keeps commitments in the row state from the table of record only', () => {
    const row = { state: { days_done: 2, chests: { 1: 'stale' } } };
    expect(withChests(row, new Map()).state).toEqual({ days_done: 2 });
    const untouched = { state: { days_done: 2 } };
    expect(withChests(untouched, new Map())).toBe(untouched);
    const next = withChests(row, new Map([[2, '20.1.aaaaaaaa'], [1, '10.0.aaaaaaaa']]));
    expect(next.state.chests).toEqual({ 1: '10.0.aaaaaaaa', 2: '20.1.aaaaaaaa' });
    expect([...chestsOf(next.state)]).toEqual([[1, '10.0.aaaaaaaa'], [2, '20.1.aaaaaaaa']]);
    expect(chestsOf({ chests: { 1: 'garbage', x: '10.0.aaaaaaaa', 0: '10.0.aaaaaaaa' } }).size).toBe(0);
  });

  it('never takes room from the other attributes: the oldest days are left out when the budget ends', () => {
    const commits = new Map([[1, '510000001.0.aaaaaaaa'], [2, '510000002.1.aaaaaaaa'], [3, '510000003.3.aaaaaaaa']]);
    const one = 8 + 'chest:1'.length + '510000001.0.aaaaaaaa'.length;
    expect(chestAttributes(commits, [], 1000).map((attribute) => attribute.key)).toEqual(['chest:1', 'chest:2', 'chest:3']);
    expect(chestAttributes(commits, [], one * 2).map((attribute) => attribute.key)).toEqual(['chest:2', 'chest:3']);
    expect(chestAttributes(commits, [{ key: 'k', value: 'v' }], one)).toEqual([]);
    expect([...onchainChests([{ key: 'tier', value: 'gold' }, { key: 'chest:3', value: '510000003.3.aaaaaaaa' }, { key: 'chest:x', value: '1.1.aaaaaaaa' }, { key: 'chest:4', value: 'nope' }])]).toEqual([[3, '510000003.3.aaaaaaaa']]);
  });

  it('rides on a full certification without shortening a claim hash, and steps aside when there is no room', () => {
    const catalog: CatalogEntry = { key: 'trail_pass', kind: 'trail', tier: 'bronze', title_i18n: {}, description_i18n: {}, art: {} };
    const claims = Array.from({ length: 10 }, (_, index) => ({ id: `html-capability-${index}`, hash: sha256Hex(String(index)), tx: 'sig' }));
    const row: AchievementRow = {
      id: 'row', user_id: 'user', achievement_key: 'trail_pass', ref_id: 'unit', earned_at: '2026-10-12T00:00:00Z', mint_status: 'minted',
      wallet_address: 'CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW', asset_address: 'asset', tx_signature: 'sig', minted_at: null,
      state: { program_slug: 'itera-v2', trail_title: { en: 'Week 1 · HTML' }, days_done: 5, total_days: 5, tier: 'gold', completed_at: '2026-10-12T00:00:00.000Z', cosmetics: { ink: 'violet', frame: 'gold-leaf' }, claims },
    };
    const before = onchainAttributes(row, catalog);
    const commits = new Map(Array.from({ length: 5 }, (_, index) => [index + 1, `51016436${index}.3.a1b2c3d4`] as const));
    const after = onchainAttributes(withChests(row, commits), catalog);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length).map((attribute) => attribute.key)).toEqual(['chest:1', 'chest:2', 'chest:3', 'chest:4', 'chest:5']);
    expect(attributeBytes(after)).toBeLessThanOrEqual(ATTRIBUTE_BUDGET_BYTES);

    const crowded = { ...row, state: { ...row.state, claims: Array.from({ length: 14 }, (_, index) => ({ id: `a-very-long-claim-id-${String(index).padStart(2, '0')}`, hash: sha256Hex(`x${index}`), tx: 'sig' })) } };
    const crowdedBefore = onchainAttributes(crowded, catalog);
    const crowdedAfter = onchainAttributes(withChests(crowded, commits), catalog);
    expect(crowdedAfter.slice(0, crowdedBefore.length)).toEqual(crowdedBefore);
    expect(attributeBytes(crowdedAfter)).toBeLessThanOrEqual(ATTRIBUTE_BUDGET_BYTES);
    expect(crowdedAfter.length - crowdedBefore.length).toBeLessThan(5);
  });
});

describe('the commit transaction', () => {
  it('finds the attribute in instruction data only as key then value, and only before the slot it names', () => {
    const borsh = (text: string) => [text.length, 0, 0, 0, ...new TextEncoder().encode(text)];
    const data = Uint8Array.from([9, 9, ...borsh('tier'), ...borsh('gold'), ...borsh('chest:5'), ...borsh('510164365.3.a1b2c3d4'), 7]);
    expect(instructionCommits(data, 5, '510164365.3.a1b2c3d4')).toBe(true);
    expect(instructionCommits(data, 4, '510164365.3.a1b2c3d4')).toBe(false);
    expect(instructionCommits(data, 5, '510164365.2.a1b2c3d4')).toBe(false);
    expect(instructionCommits(data, 5, '510164365.3.a1b2c3d')).toBe(false);
    expect(instructionCommits(new Uint8Array(), 5, '510164365.3.a1b2c3d4')).toBe(false);
    const commit = parseCommit('510164365.3.a1b2c3d4')!;
    expect(commitLandedInTime(510164364, commit)).toBe(true);
    expect(commitLandedInTime(510164365, commit)).toBe(false);
    expect(commitLandedInTime(510164400, commit)).toBe(false);
    expect(commitLandedInTime(0, commit)).toBe(false);
  });
});

describe('seed and roll', () => {
  it('derives the seed from the blockhash, the certification and the day, as text', () => {
    const seed = chestSeed('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi', 'Dk35TCfPRrZymFnpP6MfQ55Zg9LEe7BDojStY1ZfQM45', 3);
    expect(seed).toBe(sha256Hex('itera-chest:v1|4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi|Dk35TCfPRrZymFnpP6MfQ55Zg9LEe7BDojStY1ZfQM45|3'));
    expect(chestSeed('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi', 'Dk35TCfPRrZymFnpP6MfQ55Zg9LEe7BDojStY1ZfQM45', 4)).not.toBe(seed);
  });

  it('reads the tier against the cumulative odds of the level', () => {
    const tierAt = (level: EffortLevel, roll: number) => rollChest({ seed: seedOf(roll, 0), level, pool: POOL, unavailable: [] }).rolled_tier;
    expect(tierAt(0, 0)).toBe('common');
    expect(tierAt(0, 6999)).toBe('common');
    expect(tierAt(0, 7000)).toBe('rare');
    expect(tierAt(0, 9499)).toBe('rare');
    expect(tierAt(0, 9500)).toBe('epic');
    expect(tierAt(0, 9995)).toBe('mythic');
    expect(tierAt(0, 9999)).toBe('mythic');
    expect(tierAt(1, 9999)).toBe('primordial');
    expect(tierAt(3, 9989)).toBe('mythic');
    expect(tierAt(3, 9990)).toBe('primordial');
    expect(tierAt(3, 10_000 + 3799)).toBe('common');
  });

  it('is deterministic and says how it got there', () => {
    const input = { seed: seedOf(7000, 5), level: 0 as EffortLevel, pool: POOL, unavailable: [] };
    const result = rollChest(input);
    expect(result).toEqual(rollChest(input));
    expect(result).toMatchObject({ rolled_tier: 'rare', tier: 'rare', key: 'r2', tier_roll: 7000, start_roll: 5 });
    expect(result.steps[result.steps.length - 1]).toBe('rare: start 5 mod 2 = 1, skipped 0 unavailable -> r2');
    expect(() => rollChest({ ...input, seed: 'abc' })).toThrow();
  });

  it('walks past what the learner holds, then to the lower tiers, then to the higher ones', () => {
    expect(tierWalk('epic')).toEqual(['epic', 'rare', 'common', 'legendary', 'mythic', 'primordial']);
    expect(tierWalk('common')).toEqual(['common', 'rare', 'epic', 'legendary', 'mythic', 'primordial']);
    const roll = (unavailable: string[]) => rollChest({ seed: seedOf(7000, 1), level: 0, pool: POOL, unavailable });
    expect(roll([]).key).toBe('r2');
    expect(roll(['r2']).key).toBe('r1');
    expect(roll(['r1', 'r2'])).toMatchObject({ rolled_tier: 'rare', tier: 'common', key: 'c2' });
    expect(roll(['r1', 'r2', 'c1', 'c2', 'c3'])).toMatchObject({ tier: 'epic', key: 'e1' });
    const everything = Object.values(POOL).flat();
    expect(roll(everything)).toMatchObject({ rolled_tier: 'rare', tier: null, key: null });
    expect(roll(everything.filter((key) => key !== 'p1'))).toMatchObject({ tier: 'primordial', key: 'p1' });
  });

  it('spreads many seeds over the tiers about as the table says', () => {
    const counts: Record<string, number> = {};
    const runs = 20_000;
    for (let index = 0; index < runs; index += 1) {
      const tier = rollChest({ seed: chestSeed(`block${index}`, 'cert', 1), level: 1, pool: POOL, unavailable: [] }).rolled_tier;
      counts[tier] = (counts[tier] ?? 0) + 1;
    }
    expect(counts.common / runs).toBeGreaterThan(0.58);
    expect(counts.common / runs).toBeLessThan(0.62);
    expect(counts.rare / runs).toBeGreaterThan(0.28);
    expect(counts.rare / runs).toBeLessThan(0.32);
    expect(counts.epic / runs).toBeGreaterThan(0.07);
    expect(counts.epic / runs).toBeLessThan(0.105);
  });

  it('recomputes a chest from public inputs and refuses a pool that is not the committed one', () => {
    const document = poolDocument(POOL);
    const commit = commitValue({ slot: 510164365, level: 1, poolHash: poolHash(POOL) });
    const input = { blockhash: 'HASH', certification: 'CERT', day: 2, commit, poolDocument: document, unavailable: ['c1'] };
    const result = recomputeChest(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.seed).toBe(chestSeed('HASH', 'CERT', 2));
      expect(result.key).toBe(rollChest({ seed: result.seed, level: 1, pool: POOL, unavailable: ['c1'] }).key);
    }
    expect(recomputeChest({ ...input, poolDocument: poolDocument({ ...POOL, common: ['c3', 'c2', 'c1'] }) })).toEqual({ ok: false, error: 'pool_mismatch' });
    expect(recomputeChest({ ...input, commit: 'x' })).toEqual({ ok: false, error: 'bad_commit' });
    expect(recomputeChest({ ...input, poolDocument: '{}' })).toEqual({ ok: false, error: 'bad_pool' });
  });
});
