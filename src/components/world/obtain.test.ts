import { describe, expect, it } from 'vitest';
import { FALLBACK_CATALOG } from '@/services/teraCatalog.service';
import type { ShopItem } from '@/types/shop';
import { earnHow, obtainWays, ownedTerasOf } from './obtain';

const live = { ...FALLBACK_CATALOG, source: 'live' as const };

describe('obtainWays', () => {
  it('says nothing until the live catalog answered', () => {
    for (const tier of ['free', 'common', 'legendary', 'primordial'] as const) expect(obtainWays(tier, FALLBACK_CATALOG)).toEqual([]);
  });

  it('a tier on the shelf is earned or bought; a tier that is never for sale is only earned', () => {
    for (const tier of ['common', 'rare', 'epic'] as const) expect(obtainWays(tier, live, false)).toEqual(['earn', 'buy']);
    for (const tier of ['legendary', 'mythic', 'primordial'] as const) expect(obtainWays(tier, live, false)).toEqual(['earn']);
  });

  it('with the paid shelf off every tier is only earned', () => {
    for (const tier of ['common', 'rare', 'epic', 'legendary'] as const) expect(obtainWays(tier, live, true)).toEqual(['earn']);
  });

  it('a starter face is not obtained: it has no badge', () => {
    expect(obtainWays('free', live, false)).toEqual([]);
  });

  it('follows the catalog when a tier changes side', () => {
    const moved = { ...live, tiers: live.tiers.map((t) => (t.rarity === 'epic' ? { ...t, earnOnly: true } : t)) };
    expect(obtainWays('epic', moved, false)).toEqual(['earn']);
  });
});

describe('earnHow', () => {
  it('says how an earn-only tier is earned in the words of the catalog, and nothing of its own', () => {
    const told = { ...live, tiers: live.tiers.map((t) => (t.rarity === 'primordial' ? { ...t, how: { pt: 'Só do último dia do programa.', en: 'Only the last day of the program.' } } : t)) };
    expect(earnHow('primordial', told, 'pt')).toBe('Só do último dia do programa.');
    expect(earnHow('primordial', told, 'en')).toBe('Only the last day of the program.');
    expect(earnHow('legendary', told, 'en')).toBeNull();
    expect(earnHow('common', told, 'en')).toBeNull();
    expect(earnHow('primordial', { ...told, source: 'bundled' }, 'en')).toBeNull();
  });
});

describe('ownedTerasOf', () => {
  const item = (key: string, extra: Record<string, unknown>): ShopItem => ({ key, kind: 'avatar', owned: false, ...extra }) as unknown as ShopItem;
  const earned = { kind: 'earned', transferable: false, proof: null, earned: null, sponsor: null };

  it('keeps the Teras the wallet holds with their origin, and leaves out starter faces, Teras not held and other items', () => {
    const owned = ownedTerasOf([
      item('pipo', { owned: true, avatar: { free: false, origin: earned } }),
      item('dom', { owned: true, avatar: { free: false } }),
      item('ardo', { avatar: { free: false } }),
      item('tera_normal', { owned: true, avatar: { free: true } }),
      item('ink_gold', { kind: 'ink', owned: true }),
    ]);
    expect(Object.keys(owned)).toEqual(['pipo', 'dom']);
    expect(owned.pipo?.kind).toBe('earned');
    expect(owned.dom).toBeNull();
  });
});
