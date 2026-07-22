import { describe, it, expect } from 'vitest';
import { formatScheduledAt } from './formatScheduledAt';

describe('formatScheduledAt', () => {
  it('returns empty for missing / invalid input', () => {
    expect(formatScheduledAt(null, 'pt')).toBe('');
    expect(formatScheduledAt(undefined, 'en')).toBe('');
    expect(formatScheduledAt('not-a-date', 'pt')).toBe('');
  });

  it('formats a valid ISO timestamp per locale', () => {
    const iso = '2026-08-15T18:30:00.000Z';
    const pt = formatScheduledAt(iso, 'pt');
    const en = formatScheduledAt(iso, 'en');
    expect(pt).not.toBe('');
    expect(en).not.toBe('');
    // Both carry the day-of-month; locales render distinct strings.
    expect(pt).toMatch(/15/);
    expect(en).toMatch(/15/);
  });
});
