import { describe, it, expect } from 'vitest';
import { formatBillingDate } from './formatBillingDate';

describe('formatBillingDate', () => {
  it('devolve vazio para entrada ausente ou inválida', () => {
    expect(formatBillingDate(null, 'pt')).toBe('');
    expect(formatBillingDate(undefined, 'en')).toBe('');
    expect(formatBillingDate('not-a-date', 'pt')).toBe('');
  });

  it('formata a data por locale, sem hora', () => {
    const iso = '2026-09-15T18:30:00.000Z';
    const pt = formatBillingDate(iso, 'pt');
    const en = formatBillingDate(iso, 'en');
    expect(pt).toMatch(/15/);
    expect(pt).toMatch(/2026/);
    expect(en).toMatch(/September/);
    expect(pt).not.toMatch(/:/);
    expect(en).not.toMatch(/:/);
  });
});
