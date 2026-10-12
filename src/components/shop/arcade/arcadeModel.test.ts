import { describe, expect, it } from 'vitest';
import type { ShopItem } from '@/types/shop';
import type { AvatarOffer } from '@/types/avatar';
import { compactCount, defaultPick, groupsOf, royaltyPercent, shelvesOfArcade, tileLine } from './arcadeModel';

const t = (key: string) => key;
const base = (over: Partial<ShopItem>): ShopItem => ({ key: 'k', kind: 'outfit', title: 'T', description: '', priceUsdCents: 20, priceLamports: 1, priceLabel: 'US$ 0.20 ≈ 0.001 SOL', art: {}, owned: false, equipped: false, ownedRefs: [], ...over });

const offer = (over: Partial<AvatarOffer>): AvatarOffer => ({ rarity: 'common', rarityLabel: 'Common', tierName: 'Tera', group: 'base', free: false, allowsOutfit: false, imageUrl: '/a.webp', thumbUrl: '/a.webp', chipUrl: '/a.webp', supply: { minted: 0, max: null }, assetAddress: null, ...over });
const tera = (key: string, over: Partial<AvatarOffer>, item: Partial<ShopItem> = {}): ShopItem => base({ key, kind: 'avatar', avatar: offer(over), ...item });

describe('the Tera shelf', () => {
  const teras = [
    tera('face', { free: true }, { owned: true }),
    tera('phoenix', { rarity: 'primordial', tierName: 'Primordial Tera', earnOnly: true }, { forSale: false, priceLabel: 'US$ 5,000.00 ≈ 27.5 SOL' }),
    tera('sol', { rarity: 'legendary', tierName: 'Legendary Tera', earnOnly: true }, { forSale: false, priceLabel: 'US$ 100.00 ≈ 0.55 SOL' }),
    tera('void', { rarity: 'mythic', tierName: 'Mythic Tera', earnOnly: true }, { forSale: false }),
    tera('pipo', { transferable: true, royaltyBps: 500 }),
    tera('dom', { rarity: 'rare', tierName: 'Super Tera', transferable: true, royaltyBps: 0, supply: { minted: 3, max: 500 } }, { priceLabel: 'US$ 1.00 ≈ 0.0055 SOL' }),
    tera('ardo', { rarity: 'epic', tierName: 'Mega Tera', transferable: true, royaltyBps: 500, supply: { minted: 0, max: 100 } }, { priceLabel: 'US$ 10.00 ≈ 0.055 SOL' }),
  ];
  const [shelf] = shelvesOfArcade(teras);
  const groups = groupsOf(shelf, (key, params) => (params ? `${key}:${Object.values(params).join(',')}` : key), 'en');

  it('lists the three tiers for sale, then ONE earn-only group rarest first, then the free faces', () => {
    expect(groups.map((g) => [g.id, g.items.map((i) => i.key)])).toEqual([
      ['epic', ['ardo']],
      ['rare', ['dom']],
      ['common', ['pipo']],
      ['earn', ['phoenix', 'void', 'sol']],
      ['free', ['face']],
    ]);
  });

  it('says a tier for sale is transferable, and the resale fee only once one is set on chain', () => {
    expect(groups[0].note).toBe('US$ 10.00 · arcade.minted:0,100 · shelf.transferable · shelf.fee:5');
    expect(groups[1].note).toBe('US$ 1.00 · arcade.minted:3,500 · shelf.transferable');
    expect(royaltyPercent(250)).toBe('2.5');
  });

  it('keeps saying a tier is transferable when the learner holds one of its Teras, earned and bound', () => {
    const held = tera('nuno', { transferable: false, royaltyBps: 0 }, { owned: true });
    const [mixed] = shelvesOfArcade([held, tera('pipo', { transferable: true, royaltyBps: 500 })]);
    const [common] = groupsOf(mixed, (key, params) => (params ? `${key}:${Object.values(params).join(',')}` : key), 'en');
    expect(common.note).toContain('shelf.transferable · shelf.fee:5');
  });

  it('gives the earn-only group no price: only how it is earned', () => {
    const earn = groups[3];
    expect(earn.note).toBe('shelf.earn.note');
    expect(earn.note).not.toMatch(/US\$|SOL/);
    for (const item of earn.items) expect(tileLine(item, t)).toEqual({ text: 'shelf.earnOnly', tone: 'earn', crystal: false });
  });

  it('shows an earn-only Tera the learner holds as theirs, and opens the shelf on something that can be bought', () => {
    expect(tileLine({ ...teras[2], owned: true }, t).tone).toBe('mine');
    expect(defaultPick(shelf)?.key).toBe('ardo');
  });
});

describe('arcadeModel', () => {
  it('counts what the learner has per shelf and skips empty shelves', () => {
    const shelves = shelvesOfArcade([base({ key: 'a', owned: true }), base({ key: 'b' }), base({ key: 'l', kind: 'life' }), base({ key: 'i', kind: 'ink', ownedRefs: ['trail'] })]);
    expect(shelves.map((s) => [s.id, s.owned, s.total])).toEqual([
      ['lives', null, 1],
      ['outfits', 1, 2],
      ['certs', 1, 1],
    ]);
  });

  it('splits borders into the ones for sale and the signature ones', () => {
    const [shelf] = shelvesOfArcade([base({ key: 's', kind: 'border', forSale: false }), base({ key: 'b', kind: 'border' })]);
    expect(groupsOf(shelf, t, 'en').map((g) => [g.id, g.items.map((i) => i.key)])).toEqual([
      ['sale', ['b']],
      ['signature', ['s']],
    ]);
  });

  it('says the crystal price when crystals are on, the short USD price otherwise, and the state when owned', () => {
    expect(tileLine(base({ priceCrystals: 2500 }), t)).toEqual({ text: '2.5k', tone: 'price', crystal: true });
    expect(tileLine(base({ priceLabel: 'US$ 100.00 ≈ 0.5 SOL' }), t)).toEqual({ text: 'US$ 100', tone: 'price', crystal: false });
    expect(tileLine(base({ owned: true, equipped: true }), t).tone).toBe('equipped');
    expect(tileLine(base({ kind: 'border', forSale: false }), t).tone).toBe('muted');
  });

  it('opens a shelf on the first thing still to buy', () => {
    const [shelf] = shelvesOfArcade([base({ key: 'a', owned: true }), base({ key: 'b' })]);
    expect(defaultPick(shelf)?.key).toBe('b');
  });

  it('shortens large counts', () => {
    expect([150, 1000, 2500, 100000].map(compactCount)).toEqual(['150', '1k', '2.5k', '100k']);
  });
});
