import { describe, expect, it } from 'vitest';
import { fitPreview, isWorthPreviewing } from './mediaPreviewFit.js';

const viewport = { width: 1280, height: 800 };

describe('fitPreview', () => {
  it('fills the width margin for a wide image and keeps the ratio', () => {
    expect(fitPreview({ width: 3200, height: 1400 }, viewport)).toEqual({ width: 1152, height: 504 });
  });

  it('fills the height margin for a tall image', () => {
    expect(fitPreview({ width: 700, height: 1400 }, viewport)).toEqual({ width: 340, height: 680 });
  });

  it('upscales a small image by a quarter at most', () => {
    expect(fitPreview({ width: 400, height: 300 }, viewport)).toEqual({ width: 500, height: 375 });
  });

  it('never exceeds either margin', () => {
    const fit = fitPreview({ width: 5000, height: 5000 }, viewport);
    expect(fit.width).toBeLessThanOrEqual(1152);
    expect(fit.height).toBeLessThanOrEqual(680);
  });

  it('collapses an unloaded image to nothing instead of dividing by zero', () => {
    expect(fitPreview({ width: 0, height: 0 }, viewport)).toEqual({ width: 0, height: 0 });
  });
});

describe('isWorthPreviewing', () => {
  it('opens when the preview is clearly larger than the thumbnail on either side', () => {
    expect(isWorthPreviewing({ width: 1152, height: 648 }, { width: 540, height: 304 })).toBe(true);
    expect(isWorthPreviewing({ width: 302, height: 680 }, { width: 540, height: 1215 })).toBe(false);
    expect(isWorthPreviewing({ width: 600, height: 340 }, { width: 540, height: 304 })).toBe(false);
  });

  it('opens when the thumbnail size is unknown and never for an empty fit', () => {
    expect(isWorthPreviewing({ width: 800, height: 600 }, null)).toBe(true);
    expect(isWorthPreviewing({ width: 0, height: 0 }, null)).toBe(false);
  });
});
