import { describe, expect, it } from 'vitest';
import { ITERA_V2_GRAPH } from '../../../supabase/functions/_shared/capability-graph';
import { SHORT_TITLE_IDS, skillShortTitle } from './skillLabels';

describe('skillShortTitle', () => {
  it('has a short label, in both languages, for every claim of the graph and for nothing else', () => {
    expect([...SHORT_TITLE_IDS].sort()).toEqual(ITERA_V2_GRAPH.claims.map((claim) => claim.id).sort());
    for (const claim of ITERA_V2_GRAPH.claims) {
      for (const locale of ['pt', 'en']) {
        const label = skillShortTitle(claim.id, locale, '');
        expect(label.length).toBeGreaterThan(0);
        expect(label.length).toBeLessThanOrEqual(16);
      }
    }
  });

  it('picks the locale and falls back to the given title', () => {
    expect(skillShortTitle('html-form', 'pt', 'x')).toBe('Formulários');
    expect(skillShortTitle('html-form', 'en', 'x')).toBe('Forms');
    expect(skillShortTitle('unknown-claim', 'pt', 'Full title')).toBe('Full title');
  });
});
