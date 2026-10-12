import { describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';
import { buildProfileLook, shownLookTabs } from './profileLook';

const avatar = (key: string, o: { free?: boolean; owned?: boolean; group?: string; allowsOutfit?: boolean }): ShopItem =>
  ({
    key,
    kind: 'avatar',
    title: key,
    owned: o.owned ?? false,
    avatar: { rarity: 'rare', tierName: 'T', group: o.group ?? 'base', free: o.free ?? false, imageUrl: '', thumbUrl: '', chipUrl: '', assetAddress: null, allowsOutfit: o.allowsOutfit ?? false },
  }) as unknown as ShopItem;
const outfit = (key: string, owned: boolean): ShopItem => ({ key, kind: 'outfit', title: key, owned }) as unknown as ShopItem;

const items = [
  avatar('tera_normal', { free: true, group: 'expression', allowsOutfit: true }),
  avatar('tera_feliz', { free: true, group: 'expression', allowsOutfit: true }),
  avatar('base_a', { owned: true }),
  avatar('base_b', {}),
  avatar('special_c', {}),
  avatar('acc_a', { group: 'accessory', owned: true }),
  avatar('acc_b', { group: 'accessory' }),
  outfit('outfit_crown', true),
  outfit('outfit_glasses', false),
  { key: 'life', kind: 'life', owned: false } as unknown as ShopItem,
];

describe('buildProfileLook', () => {
  it('splits owned items per family', () => {
    const look = buildProfileLook(items, DEFAULT_AVATAR, null);
    expect(look.faces.map((a) => a.key)).toEqual(['tera_normal', 'tera_feliz']);
    expect(look.looks.map((a) => a.key)).toEqual(['base_a']);
    expect(look.gearAvatars.map((a) => a.key)).toEqual(['acc_a']);
    expect(look.outfits.map((o) => o.key)).toEqual(['outfit_crown']);
  });

  it('counts what is not owned and what is', () => {
    const look = buildProfileLook(items, DEFAULT_AVATAR, null);
    expect(look.missing).toEqual({ faces: 0, looks: 2, gear: 2 });
    expect(look.owned).toEqual({ faces: 2, looks: 1, gear: 2 });
  });

  it('marks the equipped outfit and gates outfits on allowsOutfit', () => {
    expect(buildProfileLook(items, DEFAULT_AVATAR, 'outfit_crown').outfits[0].equipped).toBe(true);
    const painted = { ...DEFAULT_AVATAR, key: 'base_a', allowsOutfit: false };
    expect(buildProfileLook(items, painted, null).outfitsAllowed).toBe(false);
    expect(buildProfileLook(items, DEFAULT_AVATAR, null).outfitsAllowed).toBe(true);
  });

  it('keeps the default face when the shop is empty and reports empty tabs', () => {
    const look = buildProfileLook([], DEFAULT_AVATAR, null);
    expect(look.faces).toEqual([DEFAULT_AVATAR]);
    expect(look.looks).toEqual([]);
    expect(look.owned).toEqual({ faces: 1, looks: 0, gear: 0 });
    expect(look.missing).toEqual({ faces: 0, looks: 0, gear: 0 });
  });

  it('ignores kinds it does not know', () => {
    const look = buildProfileLook([{ key: 'border_x', kind: 'border', owned: true } as unknown as ShopItem], DEFAULT_AVATAR, null);
    expect(look.owned.gear).toBe(0);
  });

  it('shows a tab in the focus build only when the learner owns something in it', () => {
    const owned = (looks: number, gear: number) => ({ owned: { faces: 2, looks, gear } });
    expect(shownLookTabs(owned(0, 0), true)).toEqual(['faces']);
    expect(shownLookTabs(owned(1, 0), true)).toEqual(['faces', 'looks']);
    expect(shownLookTabs(owned(0, 3), true)).toEqual(['faces', 'gear']);
    expect(shownLookTabs(owned(0, 0), false)).toEqual(['faces', 'looks', 'gear']);
  });
});
