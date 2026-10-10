import { describe, expect, it } from 'vitest';
import { toConfirmation, toFaucet, toIntent, toLives, toLivesUpdate, toShopItems, toSnapshot } from './shopNormalize';

describe('shop wire normalisers (shapes as deployed 2026-10-09)', () => {
  it('reads the companion answer of an e-mail user', () => {
    const snapshot = toSnapshot(
      {
        lives: { current: 5, max: 5, next_regen_at: null, regen_seconds: 0, regen_interval_seconds: 1200 },
        companion: { id: 'c1', asset_address: null, mint_status: 'unclaimed', explorer_url: null, outfit: null, level: 4, xp: 780, streak: 5 },
        inventory: [],
        wallet: null,
      },
      false
    );
    expect(snapshot.lives).toEqual({ current: 5, max: 5, nextRegenAt: null, regenSeconds: 1200 });
    expect(snapshot.companion).toMatchObject({ assetAddress: null, mintStatus: 'unclaimed', level: 4, streak: 5 });
    expect(snapshot.wallet).toBeNull();
  });

  it('treats regen_seconds as time left and regen_interval_seconds as the tick', () => {
    const lives = toLives({ current: 3, max: 5, next_regen_at: '2026-10-09T12:20:00.000Z', regen_seconds: 400, regen_interval_seconds: 1200 });
    expect(lives).toEqual({ current: 3, max: 5, nextRegenAt: '2026-10-09T12:20:00.000Z', regenSeconds: 1200 });
  });

  it('refuses an answer with no lives counter, so callers fail open', () => {
    expect(toLives({})).toBeNull();
    expect(() => toSnapshot({ companion: {} }, false)).toThrow();
  });

  it('counts a bonus only when the verdict is "granted"', () => {
    const lives = { current: 4, max: 5, next_regen_at: null, regen_seconds: 0, regen_interval_seconds: 1200 };
    expect(toLivesUpdate({ lives, companion: {}, bonus: 'granted' }).bonus).toBe(1);
    for (const bonus of ['already_granted', 'mistakes', 'lesson_incomplete', 'full', undefined]) expect(toLivesUpdate({ lives, bonus }).bonus).toBe(0);
  });

  it('reads shop items, keeping the backend price label and the per-certification ownership', () => {
    const [ink] = toShopItems([
      { key: 'ink_emerald', kind: 'ink', title: 'Tinta', description: 'd', price_usd_cents: 20, price_lamports: 1100000, price_label: 'US$ 0.20 ≈ 0.0011 SOL', art: { color: '#34D399' }, owned: false, equipped: false, owned_refs: ['unit-1'] },
      { kind: 'ink' },
    ]);
    expect(ink).toMatchObject({ key: 'ink_emerald', priceLabel: 'US$ 0.20 ≈ 0.0011 SOL', ownedRefs: ['unit-1'] });
    expect(toShopItems([{ kind: 'ink' }])).toEqual([]);
  });

  it('reads an intent and insists on its id', () => {
    expect(toIntent({ intent_id: 'i1', message_base58: 'M', transaction_base58: 'T', transaction_base64: 'B', price_lamports: 550000, price_usd_cents: 10, price_label: 'L', cluster: 'devnet' })).toMatchObject({
      intentId: 'i1',
      messageBase58: 'M',
      priceLabel: 'L',
    });
    expect(() => toIntent({})).toThrow();
  });

  it('reads a paid confirmation whose item is an object', () => {
    const paid = toConfirmation({ status: 'paid', item: { key: 'outfit_crown', kind: 'outfit', title: 'Coroa' }, inventory: [{ item_key: 'outfit_crown', kind: 'outfit', qty: 1, equipped: true }], explorer_url: 'https://e/tx' });
    expect(paid).toMatchObject({ status: 'paid', itemKey: 'outfit_crown', explorerUrl: 'https://e/tx', lives: null });
    expect(paid.inventory).toEqual([{ itemKey: 'outfit_crown', kind: 'outfit', qty: 1, equipped: true }]);
    expect(toConfirmation({}).status).toBe('failed');
  });

  it('reads both faucet answers', () => {
    expect(toFaucet({ signature: 'S', lamports: 1 })).toEqual({ signature: 'S', blocked: null });
    expect(toFaucet({ blocked: 'already_claimed' })).toEqual({ signature: null, blocked: 'already_claimed' });
  });

  it('reads the level unlock of an item that is also earned', () => {
    const [laurel, crown] = toShopItems([
      { key: 'outfit_laurel', kind: 'outfit', price_usd_cents: 50, price_lamports: 2750000, unlock: { level: 5, current_level: 3, unlocked: false } },
      { key: 'outfit_crown', kind: 'outfit', price_usd_cents: 30, price_lamports: 1650000 },
    ]);
    expect(laurel.unlock).toEqual({ level: 5, currentLevel: 3, unlocked: false });
    expect(crown.unlock).toBeNull();
    expect(toShopItems([{ key: 'x', unlock: { level: 5, current_level: null, unlocked: false } }])[0].unlock?.currentLevel).toBeNull();
  });

  it('reads season, includes, primordial rarity and the crystal price of an avatar, and tolerates their absence', () => {
    const base = { kind: 'avatar', image_url: 'https://x/a.webp', price_usd_cents: 10000, price_lamports: 1 };
    const [full, bare] = toShopItems([
      { ...base, key: 'event_natal', rarity: 'primordial', price_crystals: 2500, season: { key: 'natal', label: 'Natal', starts_at: '2026-12-01', ends_at: '2026-12-31', available: false }, includes: [{ key: 'border_pinho', kind: 'border', title: 'borda do Pinho' }, { kind: 'outfit' }] },
      { ...base, key: 'base_lider' },
    ]);
    expect(full.avatar?.rarity).toBe('primordial');
    expect(full.priceCrystals).toBe(2500);
    expect(full.avatar?.season).toEqual({ key: 'natal', label: 'Natal', startsAt: '2026-12-01', endsAt: '2026-12-31', available: false });
    expect(full.avatar?.includes).toEqual([{ key: 'border_pinho', kind: 'border', title: 'borda do Pinho' }]);
    expect(bare.priceCrystals).toBeNull();
    expect(bare.avatar?.season).toBeNull();
    expect(bare.avatar?.includes).toEqual([]);
  });

  it('reads life packs from their effect', () => {
    const [ten, infinite, refill] = toShopItems([
      { key: 'lives_10', kind: 'life', effect: { add_lives: 10 }, price_usd_cents: 30 },
      { key: 'lives_infinite', kind: 'life', effect: { unlimited_days: 30 }, price_usd_cents: 1000 },
      { key: 'life_refill', kind: 'life', price_usd_cents: 20 },
    ]);
    expect(ten.lifePack).toEqual({ addLives: 10, unlimitedDays: null });
    expect(infinite.lifePack).toEqual({ addLives: null, unlimitedDays: 30 });
    expect(refill.lifePack).toBeNull();
  });
});
