import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OUTFITS, OUTFIT_BLEED, OUTFIT_BOX, OUTFIT_FACES, OUTFIT_KEYS, OUTFIT_LAYER, frontSources, outfitOf, selectOutfit } from './outfits';

describe('outfitOf', () => {
  it('accepts shop item keys and bare names', () => {
    expect(outfitOf('outfit_glasses')).toBe('outfit_glasses');
    expect(outfitOf('crown')).toBe('outfit_crown');
    expect(outfitOf(' Outfit_Headphones ')).toBe('outfit_headphones');
    expect(outfitOf('outfit_laurel')).toBe('outfit_laurel');
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

describe('outfit layers', () => {
  const shipped = (src: string) => existsSync(join(process.cwd(), 'public', src));

  it('ships every layer an outfit names, small enough for a 32px avatar to afford', () => {
    for (const key of OUTFIT_KEYS) {
      const art = OUTFITS[key];
      const sources = [...frontSources(key), ...(art.back ? [art.back] : [])];
      expect(sources.length).toBeGreaterThan(0);
      for (const src of sources) {
        expect(src.startsWith('/mascot/outfits/')).toBe(true);
        expect(shipped(src), src).toBe(true);
        expect(statSync(join(process.cwd(), 'public', src)).size, src).toBeLessThan(40_000);
      }
    }
  });

  it('has a front for every face, and one image when the accessory never meets the crest', () => {
    for (const key of OUTFIT_KEYS) for (const face of OUTFIT_FACES) expect(OUTFITS[key].front[face]).toBeTruthy();
    expect(frontSources('outfit_crown')).toHaveLength(3);
    expect(frontSources('outfit_laurel')).toHaveLength(1);
  });

  it('sizes a layer as the face box plus the bleed on every side', () => {
    expect(OUTFIT_LAYER).toEqual({ width: OUTFIT_BOX.width + 2 * OUTFIT_BLEED, height: OUTFIT_BOX.height + 2 * OUTFIT_BLEED });
  });
});
