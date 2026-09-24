import { describe, it, expect } from 'vitest';
import { hexAlpha } from './hexAlpha';

describe('hexAlpha', () => {
  it('appends a two-digit alpha channel for a mid-range percent', () => {
    expect(hexAlpha('#3FD17F', 45)).toBe('#3FD17F73');
  });

  it('rounds down to 00 for 0%', () => {
    expect(hexAlpha('#000000', 0)).toBe('#00000000');
  });

  it('rounds up to ff for 100%', () => {
    expect(hexAlpha('#FFFFFF', 100)).toBe('#FFFFFFff');
  });
});
