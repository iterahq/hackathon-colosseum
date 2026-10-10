import { describe, expect, it } from 'vitest';
import { compactCount, isGeneratedTeraName, ledgerLabel, spendItemOf } from '@/utils/crystals';

describe('crystals utils', () => {
  it('compacts a balance', () => {
    expect(compactCount(0)).toBe('0');
    expect(compactCount(842)).toBe('842');
    expect(compactCount(1280)).toBe('1.3k');
    expect(compactCount(12400)).toBe('12k');
    expect(compactCount(-3)).toBe('0');
  });

  it('reads the item of a spend line', () => {
    expect(spendItemOf('bg_ember:0000')).toBe('bg_ember');
    expect(spendItemOf(null)).toBeNull();
  });

  it('knows the generated name shape', () => {
    expect(isGeneratedTeraName('Tera Curioso 482')).toBe(true);
    expect(isGeneratedTeraName('Tera Ágil 100')).toBe(true);
    expect(isGeneratedTeraName('Teresa Silva 482')).toBe(false);
    expect(isGeneratedTeraName('Tera Curioso 48')).toBe(false);
  });
});

describe('ledgerLabel', () => {
  const dict: Record<string, string> = { 'crystals.reason.spend': 'Compra', 'crystals.reason.lesson_clean': 'Lição sem perder vida', 'crystals.reason.unknown': 'Movimento', 'crystals.reason.spendLife': 'Compra · 1 vida' };
  const t = (key: string) => dict[key] ?? key;
  const title = (key: string) => (key === 'bg_ember' ? 'Fundo Brasa' : null);

  it('names an earn reason', () => expect(ledgerLabel('lesson_clean', null, t, title)).toBe('Lição sem perder vida'));
  it('names a spend by its item', () => {
    expect(ledgerLabel('spend', 'bg_ember:abc', t, title)).toBe('Compra · Fundo Brasa');
    expect(ledgerLabel('spend', 'life:abc', t, title)).toBe('Compra · 1 vida');
    expect(ledgerLabel('spend', 'mystery:abc', t, title)).toBe('Compra');
  });
  it('falls back to a neutral word', () => expect(ledgerLabel('e2e_seed', 'examples', t, title)).toBe('Movimento'));
});
