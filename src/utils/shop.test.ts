import { describe, expect, it } from 'vitest';
import type { CompanionSnapshot, ShopItem } from '@/types/shop';
import { shelvesOf, withCompanionState } from './shop';

const item = (key: string, kind: ShopItem['kind'], patch: Partial<ShopItem> = {}): ShopItem => ({
  key,
  kind,
  title: key,
  description: '',
  priceUsdCents: 10,
  priceLamports: 1,
  priceLabel: 'US$ 0.10',
  art: {},
  owned: false,
  equipped: false,
  ...patch,
});

const snapshot = (outfit: string | null, owned: string[]): CompanionSnapshot => ({
  lives: { current: 5, max: 5, nextRegenAt: null, regenSeconds: 1200 },
  companion: { assetAddress: null, mintStatus: 'unclaimed', explorerUrl: null, outfit, level: 1, xp: 0, streak: 0 },
  inventory: owned.map((itemKey) => ({ itemKey, kind: 'outfit', qty: 1, equipped: itemKey === outfit })),
  wallet: null,
  mocked: true,
});

describe('withCompanionState', () => {
  const items = [item('life_refill', 'life'), item('outfit_crown', 'outfit', { equipped: true, owned: true }), item('outfit_glasses', 'outfit')];

  it('returns the list untouched without a companion', () => {
    expect(withCompanionState(items, null)).toEqual(items);
  });

  it('marks a just-bought outfit as owned and moves "equipped" to what the companion wears', () => {
    const joined = withCompanionState(items, snapshot('outfit_glasses', ['outfit_crown', 'outfit_glasses']));
    expect(joined.find((i) => i.key === 'outfit_glasses')).toMatchObject({ owned: true, equipped: true });
    expect(joined.find((i) => i.key === 'outfit_crown')).toMatchObject({ owned: true, equipped: false });
  });

  it('shows nothing equipped after taking the outfit off', () => {
    expect(withCompanionState(items, snapshot(null, ['outfit_crown'])).some((i) => i.equipped)).toBe(false);
  });
});

describe('shelvesOf', () => {
  it('splits lives, outfits and certification cosmetics', () => {
    const shelves = shelvesOf([item('life_refill', 'life'), item('outfit_crown', 'outfit'), item('ink_emerald', 'ink'), item('frame_gold_leaf', 'frame')]);
    expect(shelves.lives.map((i) => i.key)).toEqual(['life_refill']);
    expect(shelves.outfits.map((i) => i.key)).toEqual(['outfit_crown']);
    expect(shelves.certs.map((i) => i.key)).toEqual(['ink_emerald', 'frame_gold_leaf']);
  });
});
