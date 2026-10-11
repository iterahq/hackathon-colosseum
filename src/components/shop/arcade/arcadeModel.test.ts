import { describe, expect, it } from 'vitest';
import type { ShopItem } from '@/types/shop';
import { compactCount, defaultPick, groupsOf, shelvesOfArcade, tileLine } from './arcadeModel';

const t = (key: string) => key;
const base = (over: Partial<ShopItem>): ShopItem => ({ key: 'k', kind: 'outfit', title: 'T', description: '', priceUsdCents: 20, priceLamports: 1, priceLabel: 'US$ 0.20 ≈ 0.001 SOL', art: {}, owned: false, equipped: false, ownedRefs: [], ...over });

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
