import { describe, expect, it } from 'vitest';
import type { AvatarOffer } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';
import { avatarState, pyramidOf, supplyText } from './avatarShop';

const offer = (patch: Partial<AvatarOffer>): AvatarOffer => ({ rarity: 'common', rarityLabel: 'Common', tierName: 'Tera', group: 'base', free: false, allowsOutfit: false, imageUrl: '/a.webp', thumbUrl: '/a.webp', chipUrl: '/a.webp', supply: { minted: 0, max: null }, assetAddress: null, ...patch });
const item = (key: string, avatar: Partial<AvatarOffer>, patch: Partial<ShopItem> = {}): ShopItem => ({ key, kind: 'avatar', title: key, description: '', priceUsdCents: 20, priceLamports: 1, priceLabel: 'US$ 0.20', art: {}, owned: false, equipped: false, ownedRefs: [], avatar: offer(avatar), ...patch });

describe('pyramidOf', () => {
  const items = [
    item('common_a', {}),
    item('free_a', { free: true, group: 'expression' }, { owned: true }),
    item('mythic_a', { rarity: 'mythic', tierName: 'Mythic Tera', supply: { minted: 2, max: 5 } }),
    item('mythic_b', { rarity: 'mythic', tierName: 'Mythic Tera', supply: { minted: 5, max: 5 } }),
  ];

  it('orders tiers from the rarest down and keeps the free icons apart', () => {
    const pyramid = pyramidOf(items);
    expect(pyramid.tiers.map((t) => t.rarity)).toEqual(['mythic', 'common']);
    expect(pyramid.free.map((i) => i.key)).toEqual(['free_a']);
  });

  it('sums the supply of a capped tier and leaves an unlimited one open', () => {
    const [mythic, common] = pyramidOf(items).tiers;
    expect(supplyText(mythic.supply, 'unlimited')).toBe('7/10');
    expect(supplyText(common.supply, 'unlimited')).toBe('unlimited');
  });
});

describe('avatarState', () => {
  it('reads equipped, free, owned, sold out and buy', () => {
    expect(avatarState(item('a', {}, { equipped: true, owned: true }))).toBe('equipped');
    expect(avatarState(item('a', { free: true }, { owned: true }))).toBe('free');
    expect(avatarState(item('a', {}, { owned: true }))).toBe('owned');
    expect(avatarState(item('a', { supply: { minted: 5, max: 5 } }))).toBe('soldout');
    expect(avatarState(item('a', { supply: { minted: 4, max: 5 } }))).toBe('buy');
  });
});
