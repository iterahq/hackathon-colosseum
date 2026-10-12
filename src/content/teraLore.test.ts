import { describe, expect, it } from 'vitest';
import {
  CRYSTAL_LORE, EARN_EVENTS, LORE_KEYS, LORE_TIERS, TIER_LORE, WORLD_LORE, loreKeysOfTier, loreOf, loreRelated, loreTierOf,
} from './teraLore';
import raw from './teraLore.json';

const LOCALES = ['pt', 'en'] as const;

describe('teraLore', () => {
  it('has the full cast', () => expect(LORE_KEYS.length).toBe(64));

  it.each(LOCALES)('every avatar has non-empty fields within limits (%s)', (locale) => {
    for (const key of LORE_KEYS) {
      const l = loreOf(key, locale)!;
      for (const f of [l.name, l.epithet, l.story, l.quote]) expect(f, key).not.toBe('');
      expect(l.name.length, key).toBeLessThanOrEqual(24);
      expect(l.epithet.length, key).toBeLessThanOrEqual(40);
      expect(l.story.length, key).toBeLessThanOrEqual(600);
      expect(l.quote.length, key).toBeLessThanOrEqual(120);
    }
  });

  it('has both languages in the source', () => {
    for (const a of Object.values(raw.avatars)) {
      for (const f of [a.name, a.epithet, a.story, a.quote]) {
        expect(f.pt).toBeTruthy();
        expect(f.en).toBeTruthy();
      }
    }
  });

  it('relations point to existing keys', () => {
    for (const key of LORE_KEYS) {
      for (const r of loreOf(key, 'pt')!.relations) expect(LORE_KEYS, `${key} -> ${r}`).toContain(r);
      expect(loreRelated(key, 'en').length).toBe(loreOf(key, 'en')!.relations.length);
    }
  });

  it('returns null for an unknown key', () => {
    expect(loreOf('nope', 'pt')).toBeNull();
    expect(loreOf('constructor', 'pt')).toBeNull();
    expect(loreRelated('nope', 'pt')).toEqual([]);
  });

  it('falls back to pt when a language is missing', () => {
    const a = raw.avatars.tera_feliz as { name: { pt: string; en?: string } };
    const saved = a.name.en;
    delete a.name.en;
    expect(loreOf('tera_feliz', 'en')!.name).toBe(a.name.pt);
    a.name.en = saved;
  });

  it('exposes world, tiers and crystal in both locales', () => {
    for (const locale of LOCALES) {
      const w = WORLD_LORE(locale);
      expect(w.name && w.tagline && w.text && w.legend).toBeTruthy();
      expect(w.places.length).toBeGreaterThan(0);
      expect(w.rules.length).toBeGreaterThan(0);
      const c = CRYSTAL_LORE(locale);
      for (const e of EARN_EVENTS) expect(c.earn[e]).not.toBe('');
      for (const t of LORE_TIERS) expect(TIER_LORE(t, locale).name).not.toBe('');
    }
  });

  it('places every avatar in exactly one tier', () => {
    const all = LORE_TIERS.flatMap((t) => loreKeysOfTier(t));
    expect(new Set(all).size).toBe(LORE_KEYS.length);
  });

  it('shows no paid avatar under the free moods, and the craft Teras under the first paid tier', () => {
    const paid = LORE_KEYS.filter((k) => !k.startsWith('tera_') && !k.startsWith('code_') && k !== 'brand_tera_hero');
    for (const key of paid) expect(loreTierOf(key), key).not.toBe('free');
    for (const key of ['acc_programador', 'acc_fogueira', 'acc_oculos_tech', 'acc_capuz_web3', 'acc_chain_link', 'acc_cyber_chip']) expect(loreTierOf(key), key).toBe('common');
    for (const key of ['base_focado', 'base_estudioso', 'base_determinado', 'base_disciplinado', 'base_focado_no_objetivo', 'base_criativo', 'base_analitico', 'color_roxo', 'color_dourado', 'acc_oculos_codificador', 'lang_solidity', 'rarity_comum', 'rarity_raro']) expect(loreTierOf(key), key).toBe('rare');
    expect(loreTierOf('rarity_epico')).toBe('epic');
    expect(loreTierOf('rarity_lendario')).toBe('legendary');
  });
});
