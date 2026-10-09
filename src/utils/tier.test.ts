import { describe, expect, it } from 'vitest';
import { tierLabel } from '@/utils/tier';

const t = (key: string) => `[${key}]`;

describe('tierLabel', () => {
  it('maps the known tiers through i18n and leaves others alone', () => {
    expect(tierLabel(t, 'Gold')).toBe('[tier.gold]');
    expect(tierLabel(t, 'bronze')).toBe('[tier.bronze]');
    expect(tierLabel(t, 'mythic')).toBe('mythic');
  });
});
