import { describe, expect, it } from 'vitest';
import { MAX_PANE_PX, stageCursorPlacement } from './stageCursorPlacement';

describe('stageCursorPlacement', () => {
  it('places in pixels of the EMITTER pane, ignoring the mirror', () => {
    // This is the whole fix: the same fraction has to land on the same character
    // whatever the mirror measures, so the number multiplied is the emitter's.
    expect(stageCursorPlacement(0.5, 0.25, 800, 400)).toEqual({
      left: '400px',
      top: '100px',
    });
  });

  it('falls back to percent when the frame carries no pane size', () => {
    // An emitter that predates px placement still draws — a little off beats not
    // at all.
    expect(stageCursorPlacement(0.5, 0.25)).toEqual({ left: '50%', top: '25%' });
  });

  it('falls back per axis, so a half-populated frame is still usable', () => {
    expect(stageCursorPlacement(0.1, 0.2, 1000, undefined)).toEqual({
      left: '100px',
      top: '20%',
    });
  });

  it('leaves room for the widest display anyone will project onto', () => {
    // The receiver rejects a size above this, so a ceiling below a real screen
    // would silently downgrade a legitimate emitter to percent placement.
    expect(MAX_PANE_PX).toBeGreaterThanOrEqual(7680);
  });

  it('does not clamp: outside the mirror is clipped, not folded back in', () => {
    // Folding an out-of-range point to the edge would draw the pointer somewhere
    // the person never was. Overflow is the honest answer.
    expect(stageCursorPlacement(1.4, -0.2, 500, 500)).toEqual({
      left: '700px',
      top: '-100px',
    });
  });
});
