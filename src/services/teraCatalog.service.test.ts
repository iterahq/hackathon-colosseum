import { describe, expect, it } from 'vitest';
import FALLBACK from '@/content/teraTiers.json';
import { LORE_KEYS, LORE_TIERS, TIER_LORE, loreTierOf } from '@/content/teraLore';
import { FALLBACK_CATALOG, toTeraCatalog } from './teraCatalog.service';

const LIVE = 'https://nyzcbnnbffsizshiolbh.supabase.co/functions/v1/credential-meta/tiers';

describe('toTeraCatalog', () => {
  it('reads the tiers lowest rank first and the rarity of each Tera', () => {
    const catalog = toTeraCatalog(
      {
        tiers: [
          { rarity: 'mythic', rank: 5, tier_name: { pt: 'Tera Mítico', en: 'Mythic Tera' }, label: { pt: 'Mítico', en: 'Mythic' }, earn_only: true },
          { rarity: 'common', rank: 1, tier_name: { pt: 'Tera', en: 'Tera' }, label: { pt: 'Comum', en: 'Common' }, earn_only: false },
        ],
        avatars: { base_lider: 'rare', tera_feliz: 'free', broken: 3 },
      },
      'live',
    );
    expect(catalog?.source).toBe('live');
    expect(catalog?.tiers.map((t) => [t.rarity, t.earnOnly])).toEqual([['common', false], ['mythic', true]]);
    expect(catalog?.avatars).toEqual({ base_lider: 'rare', tera_feliz: 'free' });
  });

  it('answers null for a body that is not a catalog', () => {
    for (const body of [null, {}, { tiers: [] }, { tiers: [{ rarity: 'common', tier_name: { en: 'Tera' } }], avatars: {} }, 'nope']) expect(toTeraCatalog(body, 'live')).toBeNull();
  });
});

describe('the bundled catalog', () => {
  it('names the six tiers /world draws, and only the three upper ones are earn-only', () => {
    expect(FALLBACK_CATALOG.source).toBe('bundled');
    expect(FALLBACK_CATALOG.tiers.map((t) => t.rarity)).toEqual(['common', 'rare', 'epic', 'legendary', 'mythic', 'primordial']);
    expect(FALLBACK_CATALOG.tiers.filter((t) => t.earnOnly).map((t) => t.rarity)).toEqual(['legendary', 'mythic', 'primordial']);
    for (const tier of FALLBACK_CATALOG.tiers) for (const locale of ['pt', 'en'] as const) expect(tier.tierName[locale], tier.rarity).toBe(TIER_LORE(tier.rarity as (typeof LORE_TIERS)[number], locale).name);
  });

  it('lists only Teras the lore knows, each under a tier that exists', () => {
    const rarities = new Set(FALLBACK.tiers.map((t) => t.rarity));
    for (const [key, rarity] of Object.entries(FALLBACK.avatars)) {
      expect(LORE_KEYS, key).toContain(key);
      expect(rarities.has(rarity), `${key}: ${rarity}`).toBe(true);
    }
  });

  // Reads the deployed catalog. Skipped only when this machine has no network: with one, a tier that moved in the catalog and not in the bundled copy fails here.
  it('agrees with the live catalog on every Tera of the cast and on every tier', async (ctx) => {
    let res: Response;
    try {
      res = await fetch(LIVE, { signal: AbortSignal.timeout(8000) });
    } catch {
      return ctx.skip();
    }
    expect(res.status, 'credential-meta/tiers').toBe(200);
    const live = toTeraCatalog(await res.json(), 'live');
    expect(live, 'the answer is a catalog').not.toBeNull();
    if (!live) return;
    const moved = LORE_KEYS.filter((key) => key in live.avatars && loreTierOf(key, live.avatars) !== loreTierOf(key)).map((key) => `${key}: bundled ${loreTierOf(key)}, catalog ${loreTierOf(key, live.avatars)}`);
    expect(moved).toEqual([]);
    // Priced in the bundled copy and absent from the catalog: only the one Tera that has no catalog row.
    expect(Object.keys(FALLBACK.avatars).filter((key) => !(key in live.avatars))).toEqual(['acc_fogueira']);
    expect(live.tiers).toEqual(FALLBACK_CATALOG.tiers);
  }, 12_000);
});
