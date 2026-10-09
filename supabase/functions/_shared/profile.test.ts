import { describe, expect, it } from 'vitest';
import { companionFromAttributes } from './companion';
import { resolveCosmetics, withCosmetics } from './cosmetics';
import { chainBlock, changedAttributes, onchainAttributes, writtenList, type AchievementRow, type CatalogEntry } from './credential';
import { buildProfile, isVerified, type OnchainAsset, type ProfileInput } from './profile';

const BASE = 'https://example.supabase.co/functions/v1';
const WALLET = 'CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW';
const USER = '0b836ee9-f287-4188-95b1-5557d5a7cca2';
const config = {
  authority: 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B',
  collection_passports: 'Eu6EyWEiDdCT7cKmVaGMeRFWvoNdUMGPVe1eou2du91b',
  collection_medals: '2frN2YFtKLWK4LCiqWMHppoGexSye9qk9xWue6ARsmDb',
  collection_companions: 'BSRAqgdY6dUPgY2iFWY2SRrzs58ptRWTtpHQSsYzYcPu',
  treasury: 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA',
};
const catalog = new Map<string, CatalogEntry>([
  ['trail_pass', { key: 'trail_pass', kind: 'trail', tier: 'bronze', title_i18n: { pt: 'Certificação', en: 'Certification' }, description_i18n: {}, art: {} }],
  ['first_stamp', { key: 'first_stamp', kind: 'milestone', tier: 'bronze', title_i18n: { pt: 'Primeiro carimbo', en: 'First stamp' }, description_i18n: {}, art: {} }],
]);
const row = (patch: Partial<AchievementRow>): AchievementRow => ({
  id: '70f5eb27-e08d-4270-aa56-3d609395da79',
  user_id: USER,
  achievement_key: 'trail_pass',
  ref_id: '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d',
  state: { trail_title: { pt: 'Semana 1 · HTML', en: 'Week 1 · HTML' }, program_slug: 'itera-v2', days_done: 4, total_days: 5, tier: 'bronze', completed_at: null },
  earned_at: '2026-10-05T15:00:00.000Z',
  mint_status: 'minted',
  wallet_address: WALLET,
  asset_address: 'Dk35TCfPRrZymFnpP6MfQ55Zg9LEe7BDojStY1ZfQM45',
  tx_signature: null,
  minted_at: '2026-10-05T15:01:00.000Z',
  ...patch,
});
const onchainAsset = (address: string, collection: string, patch: Partial<OnchainAsset> = {}): OnchainAsset => ({
  address,
  owner: WALLET,
  frozen: true,
  attributes: [],
  collection,
  update_authority: config.authority,
  ...patch,
});
const MEDAL = '5wKiMiMtAZK68aMk2rpcgfSThMr9R7rjFDhaf3tvWKFq';
const COMPANION = 'Bip1111111111111111111111111111111111111111';
const medal = row({ id: '11111111-2222-4333-8444-555555555555', achievement_key: 'first_stamp', asset_address: MEDAL, state: {} });
const input = (patch: Partial<ProfileInput> = {}): ProfileInput => ({
  wallet: WALLET,
  lang: 'pt',
  functionsBase: BASE,
  config,
  rows: [row({}), medal],
  catalog,
  companion: null,
  onchain: new Map([
    [row({}).asset_address as string, onchainAsset(row({}).asset_address as string, config.collection_passports)],
    [MEDAL, onchainAsset(MEDAL, config.collection_medals)],
  ]),
  ...patch,
});

describe('isVerified', () => {
  const expected = { wallet: WALLET, collection: config.collection_passports, authority: config.authority };
  const good = onchainAsset('A', config.collection_passports);

  it('needs the owner, our collection, our authority and the freeze, all at once', () => {
    expect(isVerified(good, expected)).toBe(true);
    expect(isVerified(undefined, expected)).toBe(false);
    expect(isVerified({ ...good, owner: 'someone-else' }, expected)).toBe(false);
    expect(isVerified({ ...good, collection: config.collection_medals }, expected)).toBe(false);
    expect(isVerified({ ...good, collection: null, update_authority: null }, expected)).toBe(false);
    expect(isVerified({ ...good, update_authority: 'another-authority' }, expected)).toBe(false);
    expect(isVerified({ ...good, frozen: false }, expected)).toBe(false);
  });

  it('never verifies against a configuration that is missing', () => {
    expect(isVerified({ ...good, collection: null, update_authority: null }, { wallet: WALLET, collection: undefined, authority: undefined })).toBe(false);
    expect(isVerified(good, { ...expected, authority: undefined })).toBe(false);
  });
});

describe('buildProfile', () => {
  it('answers a wallet with nothing with empty lists', () => {
    expect(buildProfile(input({ rows: [], onchain: new Map() }))).toEqual({
      wallet: WALLET,
      cluster: 'devnet',
      verified_count: 0,
      companion: null,
      certifications: [],
      medals: [],
      issuer: { authority: config.authority, collections: [config.collection_passports, config.collection_medals, config.collection_companions] },
    });
  });

  it('lists certifications and medals in the documented shape', () => {
    const profile = buildProfile(input());
    expect(profile.verified_count).toBe(2);
    expect(profile.certifications).toEqual([
      {
        asset: 'Dk35TCfPRrZymFnpP6MfQ55Zg9LEe7BDojStY1ZfQM45',
        verified: true,
        trail: 'Semana 1 · HTML',
        trail_title: { pt: 'Semana 1 · HTML', en: 'Week 1 · HTML' },
        days_done: 4,
        total_days: 5,
        tier: 'bronze',
        ink: null,
        frame: null,
        completed_at: null,
        earned_at: '2026-10-05T15:00:00.000Z',
        image_url: `${BASE}/credential-meta/70f5eb27-e08d-4270-aa56-3d609395da79/image.svg?lang=pt&v=4-none-none`,
        page_url: 'https://hackathon-colosseum.178-105-2-230.sslip.io/c/Dk35TCfPRrZymFnpP6MfQ55Zg9LEe7BDojStY1ZfQM45',
        explorer_url: 'https://explorer.solana.com/address/Dk35TCfPRrZymFnpP6MfQ55Zg9LEe7BDojStY1ZfQM45?cluster=devnet',
      },
    ]);
    expect(Object.keys(profile.medals[0])).toEqual(['asset', 'verified', 'key', 'title', 'tier', 'earned_at', 'image_url', 'explorer_url']);
    expect(profile.medals[0]).toMatchObject({ key: 'first_stamp', title: 'Primeiro carimbo', tier: 'bronze', verified: true });
    expect(buildProfile(input({ lang: 'en' })).medals[0].title).toBe('First stamp');
  });

  it('keeps an asset in the list but unverified when the chain disagrees', () => {
    const moved = input();
    moved.onchain.set(MEDAL, onchainAsset(MEDAL, config.collection_medals, { owner: 'someone-else' }));
    moved.onchain.delete('Dk35TCfPRrZymFnpP6MfQ55Zg9LEe7BDojStY1ZfQM45');
    const profile = buildProfile(moved);
    expect(profile.certifications[0].verified).toBe(false);
    expect(profile.medals[0].verified).toBe(false);
    expect(profile.verified_count).toBe(0);
  });

  it('does not accept a certification that sits in the medals collection', () => {
    const swapped = input();
    swapped.onchain.set('Dk35TCfPRrZymFnpP6MfQ55Zg9LEe7BDojStY1ZfQM45', onchainAsset('Dk35TCfPRrZymFnpP6MfQ55Zg9LEe7BDojStY1ZfQM45', config.collection_medals));
    expect(buildProfile(swapped).certifications[0].verified).toBe(false);
  });

  it('reads the companion from its on-chain attributes, and from the database only when the asset is unreadable', () => {
    const companion = { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', asset_address: COMPANION, version: 7, stored: { lives: 3, max_lives: 5, outfit: null, level: 2, xp: 250, streak: 1 } };
    const attributes = [
      { key: 'kind', value: 'companion' },
      { key: 'lives', value: '0' },
      { key: 'max_lives', value: '5' },
      { key: 'outfit', value: 'outfit_crown' },
      { key: 'level', value: '4' },
      { key: 'xp', value: '780' },
      { key: 'streak', value: '2' },
      { key: 'learner', value: USER },
    ];
    const onchain = input().onchain.set(COMPANION, onchainAsset(COMPANION, config.collection_companions, { attributes }));
    const profile = buildProfile(input({ companion, onchain }));
    expect(profile.companion).toEqual({
      asset: COMPANION,
      verified: true,
      lives: 0,
      max_lives: 5,
      outfit: 'outfit_crown',
      level: 4,
      xp: 780,
      streak: 2,
      image_url: `${BASE}/credential-meta/companion/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/image.svg?lang=pt&v=7-outfit_crown`,
      explorer_url: `https://explorer.solana.com/address/${COMPANION}?cluster=devnet`,
    });
    expect(profile.verified_count).toBe(3);
    expect(buildProfile(input({ companion }))).toMatchObject({ companion: { verified: false, lives: 3, level: 2, outfit: null } });
  });

  it('carries no itera user id, even when the chain attributes hold one', () => {
    const onchain = input().onchain;
    for (const asset of onchain.values()) asset.attributes = [{ key: 'learner', value: USER }];
    expect(JSON.stringify(buildProfile(input({ onchain })))).not.toContain(USER);
  });

  it('shows the ink and frame restored from purchases', () => {
    const dressed = withCosmetics(row({}), [
      { kind: 'ink', value: 'violet', paid_at: '2026-10-09T10:00:00Z' },
      { kind: 'frame', value: 'gold-leaf', paid_at: '2026-10-09T11:00:00Z' },
    ]);
    const [certification] = buildProfile(input({ rows: [dressed] })).certifications;
    expect(certification).toMatchObject({ ink: 'violet', frame: 'gold-leaf' });
    expect(certification.image_url.endsWith('v=4-violet-gold-leaf')).toBe(true);
  });
});

describe('cosmetics survive a row whose state lost them', () => {
  const passportCatalog = catalog.get('trail_pass') as CatalogEntry;
  const purchases = [
    { kind: 'ink', value: 'emerald', paid_at: '2026-10-09T10:00:00Z' },
    { kind: 'frame', value: 'gold-leaf', paid_at: '2026-10-09T10:05:00Z' },
    { kind: 'ink', value: 'violet', paid_at: '2026-10-09T10:10:00Z' },
  ];

  it('derives ink and frame from the paid purchases, the latest ink winning', () => {
    expect(resolveCosmetics({}, purchases)).toEqual({ ink: 'violet', frame: 'gold-leaf' });
    expect(resolveCosmetics({ cosmetics: { ink: 'emerald' } }, purchases)).toEqual({ ink: 'violet', frame: 'gold-leaf' });
  });

  it('keeps what the state holds when no purchase explains it', () => {
    expect(resolveCosmetics({ cosmetics: { ink: 'emerald', frame: 'gold-leaf' } }, [])).toEqual({ ink: 'emerald', frame: 'gold-leaf' });
    expect(resolveCosmetics({ cosmetics: { frame: 'gold-leaf' } }, [purchases[0]])).toEqual({ ink: 'emerald', frame: 'gold-leaf' });
  });

  it('a stamp computed from a wiped row still sends ink and frame to chain', () => {
    const wiped = row({ state: { ...row({}).state, days_done: 5, tier: 'gold' } });
    expect(onchainAttributes(wiped, passportCatalog).map(({ key }) => key)).not.toContain('ink');
    const restored = withCosmetics(wiped, purchases);
    const attributes = Object.fromEntries(onchainAttributes(restored, passportCatalog).map(({ key, value }) => [key, value]));
    expect(attributes).toMatchObject({ days_done: '5', tier: 'gold', ink: 'violet', frame: 'gold-leaf' });
    expect(restored.state.days_done).toBe(5);
  });

  it('leaves a row alone when there is nothing to restore', () => {
    const plain = row({});
    expect(withCosmetics(plain, [])).toBe(plain);
    const dressed = withCosmetics(plain, purchases);
    expect(withCosmetics(dressed, purchases)).toBe(dressed);
  });
});

describe('chain write summaries', () => {
  const before = [
    { key: 'kind', value: 'companion' },
    { key: 'lives', value: '0' },
    { key: 'max_lives', value: '5' },
    { key: 'learner', value: USER },
  ];
  const after = before.map((entry) => (entry.key === 'lives' ? { ...entry, value: '5' } : entry));
  const write = { asset: COMPANION, signature: '5sig', at: '2026-10-10T01:00:00.000Z', attributes: after, changed: changedAttributes(before, after) };

  it('lists only what changed and never the learner id', () => {
    expect(write.changed).toEqual([{ key: 'lives', value: '5' }]);
    expect(changedAttributes(null, after).map(({ key }) => key)).toEqual(['kind', 'lives', 'max_lives']);
    expect(writtenList(write)).toEqual([{ asset: COMPANION, attribute: 'lives', value: '5' }]);
  });

  it('builds the optional chain block, with lives only for an asset that has them', () => {
    expect(chainBlock(write)).toEqual({
      tx_signature: '5sig',
      explorer_url: 'https://explorer.solana.com/tx/5sig?cluster=devnet',
      lives: 5,
      mirrored_at: '2026-10-10T01:00:00.000Z',
    });
    expect(chainBlock({ ...write, attributes: [{ key: 'ink', value: 'violet' }] })).not.toHaveProperty('lives');
  });
});

describe('companionFromAttributes', () => {
  it('parses numbers as numbers and an unknown outfit as null', () => {
    expect(
      companionFromAttributes([
        { key: 'lives', value: '4' },
        { key: 'max_lives', value: '5' },
        { key: 'outfit', value: 'none' },
        { key: 'level', value: '3' },
        { key: 'xp', value: '410' },
        { key: 'streak', value: 'x' },
      ]),
    ).toEqual({ lives: 4, max_lives: 5, outfit: null, level: 3, xp: 410, streak: 0 });
    expect(companionFromAttributes([{ key: 'outfit', value: 'outfit_glasses' }]).outfit).toBe('outfit_glasses');
    expect(companionFromAttributes([{ key: 'outfit', value: '"><script>' }]).outfit).toBeNull();
  });
});
