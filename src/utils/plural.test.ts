import { describe, expect, it } from 'vitest';
import { countOf } from '@/utils/plural';

const t = (key: string) => key.split('.').slice(1).join('.');

describe('countOf', () => {
  it('uses the singular only for exactly one', () => {
    expect(countOf(t, 1, 'page')).toBe('1 page.one');
    expect(countOf(t, 0, 'page')).toBe('0 page.other');
    expect(countOf(t, 2, 'page')).toBe('2 page.other');
  });
});
