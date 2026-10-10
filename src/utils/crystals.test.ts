import { describe, expect, it } from 'vitest';
import { compactCount, isGeneratedTeraName, spendItemOf } from '@/utils/crystals';

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
