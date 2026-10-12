/** Wire-shaped chests of the contract between the Tera lanes: fixtures for the tests and the dev preview. Never used by a production path. */
const ART = 'https://nyzcbnnbffsizshiolbh.supabase.co/storage/v1/object/public/tera-avatars';

const ODDS = [
  { tier: 'common', weight: 5200 },
  { tier: 'rare', weight: 3000 },
  { tier: 'epic', weight: 1400 },
  { tier: 'legendary', weight: 330 },
  { tier: 'mythic', weight: 69 },
  { tier: 'primordial', weight: 1 },
];

const BASE = { id: 'chest_fixture_1', day: 3, trail: 'HTML', certification: 'FixtureCert1111111111111111111111111111111', odds: ODDS };

export const WIRE_CHEST_COMMITTED = { ...BASE, status: 'committed', commit: { slot: 418_220_113, tx: '5fixtureCommitSignature' }, seed: null, tier: null, tera: null, retry_after_ms: 1200 };

export const WIRE_CHEST_ROLLING = { ...WIRE_CHEST_COMMITTED, status: 'rolling', seed: { slot: 418_220_114, blockhash: '9xFixtureBlockhash111111111111111111111111111' } };

export const WIRE_CHEST_MINTED = {
  ...WIRE_CHEST_ROLLING,
  status: 'minted',
  tier: 'rare',
  retry_after_ms: undefined,
  tera: {
    key: 'base_lider',
    title: 'Tera, leader',
    tier_name: 'Super Tera',
    image_url: `${ART}/base_lider.webp`,
    thumb_url: `${ART}/base_lider_128.webp`,
    asset: 'FixtureTera11111111111111111111111111111111',
    page_url: '/c/FixtureTera11111111111111111111111111111111',
    explorer_url: 'https://explorer.solana.com/address/FixtureTera11111111111111111111111111111111?cluster=devnet',
  },
};

export const WIRE_CHEST_FAILED = { ...WIRE_CHEST_COMMITTED, status: 'failed' };

export const WIRE_RECOMPUTE = {
  formula: 'seed = sha256(blockhash | certification | day); tier = pick(odds, seed[0..4]); tera = first of pool[tier] not held, from seed[4..8]',
  inputs: { certification: BASE.certification, day: 3, commit_slot: 418_220_113, seed_slot: 418_220_114, blockhash: '9xFixtureBlockhash111111111111111111111111111', verified_share: 100, clean_day: 1, gold: 0 },
  pool: { rare: ['base_lider', 'base_livre', 'base_natural'] },
  pool_document: '{"v":1,"tiers":[["rare",["base_lider","base_livre","base_natural"]]]}',
  unavailable: ['base_livre'],
  from_chain: ['certification', 'day', 'commit', 'blockhash'],
  from_itera: { held: ['base_livre'], exhausted: [] },
  steps: ['seed = 4be1…', 'roll 0.6312 of 10000 -> rare', 'index 0 of 3 -> base_lider'],
};
