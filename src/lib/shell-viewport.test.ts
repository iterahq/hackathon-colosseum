import { describe, expect, it } from 'vitest';
import { lockedViewport } from './shell-viewport';

describe('lockedViewport', () => {
  it('pins the scale and keeps the directives of index.html', () => {
    expect(lockedViewport('width=device-width, initial-scale=1.0, viewport-fit=cover')).toBe(
      'width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1, user-scalable=no',
    );
  });

  it('replaces a scale limit that is already there, whatever its case or spacing', () => {
    expect(lockedViewport('width=device-width,Maximum-Scale = 5, user-scalable=yes')).toBe(
      'width=device-width, maximum-scale=1, user-scalable=no',
    );
  });

  it('is stable when applied twice', () => {
    const once = lockedViewport('width=device-width, initial-scale=1.0');
    expect(lockedViewport(once)).toBe(once);
  });

  it('builds the lock from an empty content', () => {
    expect(lockedViewport('')).toBe('maximum-scale=1, user-scalable=no');
  });
});
