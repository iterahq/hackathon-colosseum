import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, VIEW_HOME, clampPan, fitSize, zoomAt } from './artViewerMath';

const stage = { width: 800, height: 600 };

describe('artViewerMath', () => {
  it('fits a portrait art by height and a landscape art by width', () => {
    expect(fitSize(stage, 3 / 4)).toEqual({ width: 450, height: 600 });
    expect(fitSize(stage, 2)).toEqual({ width: 800, height: 400 });
  });

  it('keeps the art centred while it does not overflow', () => {
    expect(clampPan({ zoom: 1, x: 300, y: -200 }, fitSize(stage, 1), stage)).toEqual({ zoom: 1, x: 0, y: 0 });
  });

  it('lets a zoomed art move only as far as it overflows', () => {
    const fit = fitSize(stage, 1);
    expect(clampPan({ zoom: 2, x: 999, y: -999 }, fit, stage)).toEqual({ zoom: 2, x: 200, y: -300 });
  });

  it('zooms around the pointer and never past the limits', () => {
    const fit = fitSize(stage, 1);
    const view = zoomAt(VIEW_HOME, 2, { x: 100, y: 0 }, fit, stage);
    expect(view).toEqual({ zoom: 2, x: -100, y: 0 });
    expect(zoomAt(view, 99, { x: 0, y: 0 }, fit, stage).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(view, 0.1, { x: 0, y: 0 }, fit, stage)).toEqual(VIEW_HOME);
  });
});
