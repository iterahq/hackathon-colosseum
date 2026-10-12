import { Braces, CodeXml, Lock, Palette, Sparkles, Tag } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ITERA_V2_GRAPH } from '../../../supabase/functions/_shared/capability-graph';
import { GLYPH_CLAIM_IDS, skillFamily, skillIcon } from './skillIcon';

describe('skillFamily', () => {
  it('reads the family from the claim id prefix', () => {
    expect(skillFamily('html-tags')).toBe('html');
    expect(skillFamily('css-flex-row')).toBe('css');
    expect(skillFamily('js-dom-write')).toBe('js');
  });

  it('answers other for an id it does not know', () => {
    expect(skillFamily('python-loops')).toBe('other');
    expect(skillFamily('')).toBe('other');
    expect(skillFamily('htmlx-tags')).toBe('other');
  });
});

describe('skillIcon', () => {
  it('has a glyph for every claim of the graph and for nothing else, and no two claims share one', () => {
    const ids = ITERA_V2_GRAPH.claims.map((claim) => claim.id);
    expect([...GLYPH_CLAIM_IDS].sort()).toEqual([...ids].sort());
    expect(new Set(ids.map((id) => skillIcon(id))).size).toBe(ids.length);
  });

  it('keeps the padlock, the family glyphs and the fallback apart from every claim glyph', () => {
    const taken = new Set(ITERA_V2_GRAPH.claims.map((claim) => skillIcon(claim.id)));
    for (const icon of [Lock, CodeXml, Palette, Braces, Sparkles]) expect(taken.has(icon)).toBe(false);
  });

  it('shows the claim glyph lit or neutral', () => {
    expect(skillIcon('html-tags')).toBe(Tag);
    expect(skillIcon('html-tags', 'lit')).toBe(Tag);
  });

  it('falls back to the family glyph for a claim with none', () => {
    expect(skillIcon('html-new-thing')).toBe(CodeXml);
    expect(skillIcon('css-new-thing', 'lit')).toBe(Palette);
    expect(skillIcon('js-new-thing')).toBe(Braces);
    expect(skillIcon('rust-traits')).toBe(Sparkles);
  });

  it('shows the padlock for a locked skill of any family', () => {
    expect(skillIcon('html-tags', 'locked')).toBe(Lock);
    expect(skillIcon('rust-traits', 'locked')).toBe(Lock);
  });
});
