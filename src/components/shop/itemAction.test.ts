import { describe, expect, it, vi } from 'vitest';
import type { AvatarOffer } from '@/types/avatar';
import type { ShopItem } from '@/types/shop';
import type { ShopActions } from '@/types/shopView';
import { itemAction } from './itemAction';

const t = (key: string) => key;
const offer = (over: Partial<AvatarOffer>): AvatarOffer => ({ rarity: 'legendary', rarityLabel: 'Legendary', tierName: 'Legendary Tera', group: 'special', free: false, allowsOutfit: false, imageUrl: '/a.webp', thumbUrl: '/a.webp', chipUrl: '/a.webp', supply: { minted: 0, max: 25 }, assetAddress: null, ...over });
const tera = (over: Partial<AvatarOffer>, item: Partial<ShopItem> = {}): ShopItem => ({ key: 'sol', kind: 'avatar', title: 'Sol', description: '', priceUsdCents: 10000, priceLamports: 1, priceLabel: 'US$ 100.00 ≈ 0.55 SOL', art: {}, owned: false, equipped: false, ownedRefs: [], avatar: offer(over), ...item });
const actions = (): ShopActions => ({ busy: false, hasWallet: true, buy: vi.fn(), claim: vi.fn(), equip: vi.fn(), unequip: vi.fn(), tryOn: vi.fn() });

describe('itemAction for a Tera', () => {
  it('an earn-only Tera has no buy: nothing to press, no price, the way to earn it', () => {
    const a = actions();
    const action = itemAction(tera({ earnOnly: true }), a, t, { withPrice: true });
    expect(action).toEqual({ id: 'earn', label: 'shelf.earn.how', disabled: true, primary: false });
    expect(action.run).toBeUndefined();
    expect(a.buy).not.toHaveBeenCalled();
  });

  it('an earn-only Tera the learner holds is equipped like any other', () => {
    expect(itemAction(tera({ earnOnly: true }, { owned: true }), actions(), t).id).toBe('equip');
  });

  it('a Tera for sale is bought', () => {
    expect(itemAction(tera({ rarity: 'rare', transferable: true }), actions(), t).id).toBe('buy');
  });
});
