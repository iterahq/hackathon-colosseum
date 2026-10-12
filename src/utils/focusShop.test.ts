import { describe, expect, it } from 'vitest';
import type { ShopItem } from '@/types/shop';
import { focusShopItems, isHiddenPaidTera, isPaidTera } from './focusShop';

const item = (key: string, kind: string, extra: Record<string, unknown> = {}): ShopItem => ({ key, kind, owned: false, ownedRefs: [], ...extra }) as unknown as ShopItem;
const list = [
  item('ink_gold', 'ink'),
  item('frame_fire', 'frame'),
  item('face_happy', 'avatar', { owned: true, avatar: { free: true, rarity: 'common' } }),
  item('base_lider', 'avatar', { avatar: { free: false, rarity: 'rare' } }),
  item('special_dourado', 'avatar', { owned: true, avatar: { free: false, rarity: 'legendary', earnOnly: true } }),
  item('event_space', 'avatar', { avatar: { free: false, rarity: 'mythic', earnOnly: true } }),
  item('event_natal', 'avatar', { avatar: { free: false, rarity: 'epic', season: { available: true } } }),
  item('cape', 'outfit'),
  item('scarf', 'outfit', { owned: true }),
  item('life_1', 'life'),
  item('border_x', 'border'),
];
const keys = (items: ShopItem[]) => items.map((i) => i.key);

describe('focusShopItems', () => {
  it('lists the certification cosmetics and every Tera: free, for sale and earn-only; nothing else', () => {
    expect(keys(focusShopItems(list, 'shelf', true, false))).toEqual(['ink_gold', 'frame_fire', 'face_happy', 'base_lider', 'special_dourado', 'event_space', 'event_natal']);
  });

  it('wears only the free faces and what the wallet owns: a Tera on the shelf is not in the wardrobe', () => {
    expect(keys(focusShopItems(list, 'wardrobe', true, false))).toEqual(['ink_gold', 'frame_fire', 'face_happy', 'special_dourado', 'scarf']);
  });

  it('returns everything when the focus is off', () => {
    expect(focusShopItems(list, 'shelf', false)).toHaveLength(list.length);
    expect(focusShopItems(list, 'wardrobe', false)).toHaveLength(list.length);
  });
});

describe('the paid Tera shelf off', () => {
  it('drops the Teras for sale the learner does not own and keeps the free faces, the earn-only tiers and the cosmetics', () => {
    expect(keys(focusShopItems(list, 'shelf', true, true))).toEqual(['ink_gold', 'frame_fire', 'face_happy', 'special_dourado', 'event_space']);
  });

  it('keeps a Tera the wallet already bought, on the shelf and in the wardrobe', () => {
    const bought = [...list, item('base_mago', 'avatar', { owned: true, avatar: { free: false, rarity: 'rare' } })];
    expect(keys(focusShopItems(bought, 'shelf', true, true))).toContain('base_mago');
    expect(keys(focusShopItems(bought, 'wardrobe', true, true))).toContain('base_mago');
  });

  it('tells a Tera for sale from a free face, an earn-only tier and anything that is not a Tera', () => {
    expect(isPaidTera(item('base_lider', 'avatar', { avatar: { free: false, rarity: 'rare' } }))).toBe(true);
    expect(isPaidTera(item('face_happy', 'avatar', { avatar: { free: true } }))).toBe(false);
    expect(isPaidTera(item('event_space', 'avatar', { avatar: { free: false, earnOnly: true } }))).toBe(false);
    expect(isPaidTera(item('ink_gold', 'ink'))).toBe(false);
  });

  it('refuses a hidden one only while the shelf is off and the wallet does not own it', () => {
    const paid = item('base_lider', 'avatar', { avatar: { free: false, rarity: 'rare' } });
    expect(isHiddenPaidTera(paid, true)).toBe(true);
    expect(isHiddenPaidTera(paid, false)).toBe(false);
    expect(isHiddenPaidTera({ ...paid, owned: true }, true)).toBe(false);
    expect(isHiddenPaidTera(item('ink_gold', 'ink'), true)).toBe(false);
  });
});
