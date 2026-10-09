import { describe, expect, it } from 'vitest';
import { OUTFITS, OUTFIT_BOX, OUTFIT_KEYS, outfitOf, selectOutfit } from './outfits';

describe('outfitOf', () => {
  it('accepts shop item keys and bare names', () => {
    expect(outfitOf('outfit_glasses')).toBe('outfit_glasses');
    expect(outfitOf('crown')).toBe('outfit_crown');
    expect(outfitOf(' Outfit_Headphones ')).toBe('outfit_headphones');
  });

  it('draws nothing for none, unknown or non-outfit keys', () => {
    expect(outfitOf(null)).toBeNull();
    expect(outfitOf('')).toBeNull();
    expect(outfitOf('outfit_cape')).toBeNull();
    expect(outfitOf('ink_emerald')).toBeNull();
    expect(outfitOf('toString')).toBeNull();
  });
});

describe('selectOutfit', () => {
  it('shows the equipped outfit when nothing is previewed', () => {
    expect(selectOutfit('outfit_crown')).toBe('outfit_crown');
    expect(selectOutfit(null)).toBeNull();
  });

  it('lets a preview win, including previewing "nothing"', () => {
    expect(selectOutfit('outfit_crown', 'outfit_glasses')).toBe('outfit_glasses');
    expect(selectOutfit('outfit_crown', null)).toBeNull();
  });
});

describe('outfit shapes', () => {
  it('has a path set for every outfit, all inside the face box', () => {
    for (const key of OUTFIT_KEYS) {
      expect(OUTFITS[key].length).toBeGreaterThan(0);
      for (const shape of OUTFITS[key]) {
        const start = /^M(-?[\d.]+) (-?[\d.]+)/.exec(shape.d);
        expect(shape.fill ?? shape.stroke, `${key}: a shape needs a fill or a stroke`).toBeTruthy();
        expect(start, `${key}: ${shape.d}`).not.toBeNull();
        expect(Number(start?.[1])).toBeLessThanOrEqual(OUTFIT_BOX.width);
        expect(Number(start?.[2])).toBeLessThanOrEqual(OUTFIT_BOX.height);
      }
    }
  });
});
