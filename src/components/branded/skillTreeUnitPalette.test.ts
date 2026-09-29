import { describe, it, expect } from 'vitest';
import { darken, toneForUnit, UNIT_PALETTE } from './skillTreeUnitPalette';

describe('skillTreeUnitPalette', () => {
  it('cycles tones every three units', () => {
    expect(toneForUnit(3)).toBe(UNIT_PALETTE[0]);
    expect(toneForUnit(4)).toBe(UNIT_PALETTE[1]);
  });

  it('darkens a hex color channel-wise', () => {
    expect(darken('#3FD17F', 0)).toBe('#3fd17f');
    expect(darken('#FFFFFF', 50)).toBe('#808080');
    expect(darken('#0066FF', 100)).toBe('#000000');
  });
});
