import { describe, expect, it } from 'vitest';
import { toShopItems } from '@/services/shopNormalize';
import { mockAvatarItems } from '@/services/shopMockAvatars';
import { featuredOf, includesLine, isOffSeason, returnLine, rowsOf, shortPrice } from './avatarRows';

const t = (key: string, p: Record<string, string | number> = {}) => `${key}${Object.values(p).length ? ':' + Object.values(p).join(',') : ''}`;
const items = toShopItems(mockAvatarItems('en', { owned: ['special_dourado'], avatar: 'tera_feliz', asset: 'A' }));
const byKey = (key: string) => items.find((i) => i.key === key)!;

describe('rowsOf', () => {
  it('orders the seven rows rarest first, with the free icons apart', () => {
    const { rows, free } = rowsOf(items);
    expect(rows.map((r) => r.rarity)).toEqual(['primordial', 'mythic', 'legendary', 'epic', 'rare', 'common']);
    expect(free).toHaveLength(10);
  });
  it('sums the supply and keeps the USD part of the price', () => {
    const mythic = rowsOf(items).rows[1];
    expect(mythic.supply).toEqual({ minted: 8, max: 15 });
    expect(mythic.priceShort).toBe('US$ 1000.00');
    expect(rowsOf(items).rows[5].supply.max).toBeNull();
  });
  it('carries the crystal price of the tier', () => {
    expect(rowsOf(items).rows[3].priceCrystals).toBe(2500);
    expect(rowsOf(items).rows[2].priceCrystals).toBeNull();
  });
});

describe('seasons and includes', () => {
  it('flags an avatar outside its window, unless it is owned', () => {
    expect(isOffSeason(byKey('event_natal'))).toBe(true);
    expect(isOffSeason({ ...byKey('event_natal'), owned: true })).toBe(false);
    expect(isOffSeason(byKey('event_halloween'))).toBe(false);
  });
  it('says when the season returns', () => {
    expect(returnLine(byKey('event_natal'), 'en', t)).toBe('shop.season.returns:December');
  });
  it('lists what the avatar includes', () => {
    expect(includesLine(byKey('event_verao'), t)).toBe("shop.includes:Caju's border · glasses");
    expect(includesLine(byKey('base_lider'), t)).toBe('');
  });
});

describe('featuredOf', () => {
  it('skips sold out and out-of-season avatars', () => {
    expect(featuredOf(rowsOf(items).rows)?.key).toBe('brand_phoenix_full');
    const rest = items.filter((i) => i.key !== 'brand_phoenix_full');
    expect(featuredOf(rowsOf(rest).rows)?.key).toBe('event_space');
  });
  it('shortens a price label', () => {
    expect(shortPrice('US$ 1.00 ≈ 0.0055 SOL')).toBe('US$ 1.00');
    expect(shortPrice('Free')).toBe('Free');
  });
});
