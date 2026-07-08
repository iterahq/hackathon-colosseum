import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStopwatch } from '@/hooks/useStopwatch';

const BASE = 1_700_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
});
afterEach(() => vi.useRealTimers());

describe('useStopwatch', () => {
  it('counts whole seconds up from the start time', () => {
    const { result } = renderHook(() => useStopwatch(BASE));
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(3200);
    });
    expect(result.current).toBe(3);
  });

  it('returns 0 with no start time', () => {
    const { result } = renderHook(() => useStopwatch(null));
    expect(result.current).toBe(0);
  });
});
