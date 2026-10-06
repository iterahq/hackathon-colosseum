import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { NARROW_VIEWPORT_QUERY, useNarrowViewport } from './useNarrowViewport.js';

function stubMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const state = { matches };
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === NARROW_VIEWPORT_QUERY && state.matches;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  return {
    flip(next: boolean) {
      state.matches = next;
      listeners.forEach((fn) => fn());
    },
  };
}

describe('useNarrowViewport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads false when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useNarrowViewport()).result.current).toBe(false);
  });

  it('reads the query and follows a change', () => {
    const media = stubMedia(true);
    const { result } = renderHook(() => useNarrowViewport());
    expect(result.current).toBe(true);
    act(() => media.flip(false));
    expect(result.current).toBe(false);
  });
});
