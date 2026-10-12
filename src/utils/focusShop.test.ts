import { describe, expect, it } from 'vitest';
import type { ShopItem } from '@/types/shop';
import { focusShopItems } from './focusShop';

const item = (key: string, kind: string, extra: Record<string, unknown> = {}): ShopItem => ({ key, kind, owned: false, ownedRefs: [], ...extra }) as unknown as ShopItem;
const list = [
  item('ink_gold', 'ink'),
  item('frame_fire', 'frame'),
  item('face_happy', 'avatar', { owned: true, avatar: { free: true, rarity: 'common' } }),
  item('base_lider', 'avatar', { avatar: { free: false, rarity: 'rare' } }),
  item('special_dourado', 'avatar', { owned: true, avatar: { free: false, rarity: 'legendary' } }),
  item('event_natal', 'avatar', { avatar: { free: false, rarity: 'epic', season: { available: true } } }),
  item('cape', 'outfit'),
  item('scarf', 'outfit', { owned: true }),
  item('life_1', 'life'),
  item('border_x', 'border'),
];
const keys = (items: ShopItem[]) => items.map((i) => i.key);

describe('focusShopItems', () => {
  it('lists the certification cosmetics and the free faces only: no paid avatar tier, owned or not', () => {
    expect(keys(focusShopItems(list, 'shelf', true))).toEqual(['ink_gold', 'frame_fire', 'face_happy']);
  });

  it('keeps what the wallet already owns wearable', () => {
    expect(keys(focusShopItems(list, 'wardrobe', true))).toEqual(['ink_gold', 'frame_fire', 'face_happy', 'special_dourado', 'scarf']);
  });

  it('returns everything when the focus is off', () => {
    expect(focusShopItems(list, 'shelf', false)).toHaveLength(list.length);
    expect(focusShopItems(list, 'wardrobe', false)).toHaveLength(list.length);
  });
});
