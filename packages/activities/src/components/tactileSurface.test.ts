import { describe, expect, it } from 'vitest';
import { tactileSurface, type SurfaceState } from './tactileSurface.js';

const STATES: SurfaceState[] = ['idle', 'picked', 'right', 'miss', 'lifted'];

describe('tactileSurface', () => {
  it.each(STATES)('%s carries exactly one border colour and no red', (state) => {
    const classes = tactileSurface(state, true).split(' ');
    const borderColors = classes.filter((c) => /^border-(?!2$|b-4$|b-2$|dashed$)/.test(c));
    expect(borderColors).toHaveLength(1);
    expect(classes.join(' ')).not.toMatch(/destructive|red-/);
  });

  it('drops the press classes when the surface is not pressable', () => {
    expect(tactileSurface('idle', false)).not.toContain('active:');
    expect(tactileSurface('idle', true)).toContain('active:translate-y-[2px]');
  });
});
