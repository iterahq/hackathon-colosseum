import { describe, it, expect } from 'vitest';
import { formatMmss } from './formatMmss';

describe('formatMmss', () => {
  it('pads seconds to two digits', () => {
    expect(formatMmss(65)).toBe('1:05');
    expect(formatMmss(9)).toBe('0:09');
  });

  it('floors fractional seconds and clamps negatives to 0:00', () => {
    expect(formatMmss(119.9)).toBe('1:59');
    expect(formatMmss(-5)).toBe('0:00');
  });
});
