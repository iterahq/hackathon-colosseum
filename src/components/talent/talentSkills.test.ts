import { describe, expect, it } from 'vitest';
import type { TalentLearner } from '@/types/talent';
import { advancedFirst, capabilityTier, cardTierCounts, inTrail, learnersOfTrail, parseTrail } from './talentSkills';

const cap = (key: string, graded?: string | null) => ({ key, title: key, ...(graded === undefined ? {} : { graded }) });
const learner = (wallet: string, keys: string[]): TalentLearner => ({
  wallet, name: null, avatar: null, headline: null, stampedDays: 1, totalDays: 15, certifications: 1, capabilities: keys.map((key) => cap(key)),
  bountiesPaid: 0, bountiesPaidLamports: 0, lastStampAt: null, profileUrl: `/u/${wallet}`, teamTest: false,
});

describe('talent skills', () => {
  it('reads a trail from the address and refuses anything else', () => {
    expect(parseTrail('css')).toBe('css');
    expect(parseTrail('other')).toBe('');
    expect(parseTrail('<b>')).toBe('');
    expect(parseTrail(null)).toBe('');
  });

  it('puts the furthest skill first without touching the list it was given', () => {
    const given = [cap('html-tags'), cap('html-skeleton'), cap('css-rules')];
    expect(advancedFirst(given).map((entry) => entry.key)).toEqual(['css-rules', 'html-skeleton', 'html-tags']);
    expect(given[0].key).toBe('html-tags');
  });

  it('gives a tier only when the board stated a share or its absence', () => {
    expect(capabilityTier(cap('a', '12/12'))).toBe('top');
    expect(capabilityTier(cap('a', '10/12'))).toBe('middle');
    expect(capabilityTier(cap('a', null))).toBe('base');
    expect(capabilityTier(cap('a', 'nonsense'))).toBe('base');
    expect(capabilityTier(cap('a'))).toBeNull();
  });

  it('counts a card per tier, and nothing for a board that carries no share', () => {
    expect(cardTierCounts([cap('a', '10/12'), cap('b', '10/12'), cap('c', null)])).toEqual({ top: 0, middle: 2, base: 1 });
    expect(cardTierCounts([cap('a'), cap('b')])).toBeNull();
    expect(cardTierCounts([])).toBeNull();
  });

  it('keeps the learners who proved a skill of the trail', () => {
    const all = [learner('A', ['html-tags']), learner('B', ['html-tags', 'css-rules']), learner('C', [])];
    expect(learnersOfTrail(all, 'css').map((entry) => entry.wallet)).toEqual(['B']);
    expect(learnersOfTrail(all, 'js')).toEqual([]);
    expect(learnersOfTrail(all, '')).toHaveLength(3);
    expect(inTrail(all[1].capabilities, 'html').map((entry) => entry.key)).toEqual(['html-tags']);
  });
});
