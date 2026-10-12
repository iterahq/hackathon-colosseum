import { describe, expect, it } from 'vitest';
import { FALLBACK_CATALOG } from '@/services/teraCatalog.service';
import { obtainKey } from './TierSection';

const live = { ...FALLBACK_CATALOG, source: 'live' as const };

describe('obtainKey', () => {
  it('says nothing until the live catalog answered', () => {
    for (const tier of ['free', 'common', 'legendary', 'primordial'] as const) expect(obtainKey(tier, FALLBACK_CATALOG)).toBeNull();
  });

  it('tells a tier on the shelf from one that is never for sale', () => {
    expect(obtainKey('free', live)).toBe('world.obtain.free');
    for (const tier of ['common', 'rare', 'epic'] as const) expect(obtainKey(tier, live)).toBe('world.obtain.shelf');
    for (const tier of ['legendary', 'mythic'] as const) expect(obtainKey(tier, live)).toBe('world.obtain.earnOnly');
    expect(obtainKey('primordial', live)).toBe('world.obtain.primordial');
  });

  it('follows the catalog when a tier changes side', () => {
    const moved = { ...live, tiers: live.tiers.map((t) => (t.rarity === 'epic' ? { ...t, earnOnly: true } : t)) };
    expect(obtainKey('epic', moved)).toBe('world.obtain.earnOnly');
  });
});
