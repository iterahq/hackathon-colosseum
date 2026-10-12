import { describe, expect, it } from 'vitest';
import { FALLBACK_CATALOG } from '@/services/teraCatalog.service';
import { earnHow, obtainKey } from './TierSection';

const live = { ...FALLBACK_CATALOG, source: 'live' as const };

describe('obtainKey', () => {
  it('says nothing until the live catalog answered', () => {
    for (const tier of ['free', 'common', 'legendary', 'primordial'] as const) expect(obtainKey(tier, FALLBACK_CATALOG)).toBeNull();
  });

  it('tells a tier on the shelf from one that is never for sale', () => {
    expect(obtainKey('free', live)).toBe('world.obtain.free');
    for (const tier of ['common', 'rare', 'epic'] as const) expect(obtainKey(tier, live, false)).toBe('world.obtain.shelf');
    for (const tier of ['common', 'rare', 'epic'] as const) expect(obtainKey(tier, live, true)).toBe('world.obtain.chest');
    for (const tier of ['legendary', 'mythic', 'primordial'] as const) expect(obtainKey(tier, live)).toBe('world.obtain.earnOnly');
  });

  it('follows the catalog when a tier changes side', () => {
    const moved = { ...live, tiers: live.tiers.map((t) => (t.rarity === 'epic' ? { ...t, earnOnly: true } : t)) };
    expect(obtainKey('epic', moved)).toBe('world.obtain.earnOnly');
  });

  it('says how an earn-only tier is earned in the words of the catalog, and nothing of its own', () => {
    const told = { ...live, tiers: live.tiers.map((t) => (t.rarity === 'primordial' ? { ...t, how: { pt: 'Só do último dia do programa.', en: 'Only the last day of the program.' } } : t)) };
    expect(earnHow('primordial', told, 'pt')).toBe('Só do último dia do programa.');
    expect(earnHow('primordial', told, 'en')).toBe('Only the last day of the program.');
    expect(earnHow('legendary', told, 'en')).toBeNull();
    expect(earnHow('common', told, 'en')).toBeNull();
    expect(earnHow('primordial', { ...told, source: 'bundled' }, 'en')).toBeNull();
  });
});
