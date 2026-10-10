import { describe, expect, it } from 'vitest';
import { toShopItems } from '@/services/shopNormalize';
import { borderOf, formatCount, swatchColors } from './pay';

describe('formatCount', () => {
  it('separates thousands by locale', () => {
    expect(formatCount(10000, 'pt')).toBe('10 000');
    expect(formatCount(10000, 'en')).toBe('10,000');
    expect(formatCount(150, 'pt')).toBe('150');
  });
});

describe('swatch fields as the backend lists them', () => {
  const [border, bg, none] = toShopItems([
    { key: 'border_bronze', kind: 'border', border: { style: 'solid', colors: ['#CD7F32'], glow: false, animated: false } },
    { key: 'bg_obsidian', kind: 'background', color: '#0A0908' },
    { key: 'border_none', kind: 'border', border: null },
  ]);
  it('reads the ring of a border and the colour of a background', () => {
    expect(borderOf(border).colors).toEqual(['#CD7F32']);
    expect(swatchColors(bg)).toEqual(['#0A0908']);
    expect(borderOf(none).style).toBe('solid');
  });
});
